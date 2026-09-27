import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { FormWorkflow } from "@/shared/contracts";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FormWorkflow;
    const { templateId } = body;

    if (!templateId) {
      return NextResponse.json({ error: "Thiếu templateId" }, { status: 400 });
    }

    // 1. Thư mục lưu trữ biểu mẫu chính và thư mục lịch sử
    const baseDir = path.join(process.cwd(), "assets", "mock-data");
    const historyDir = path.join(baseDir, "history");

    await fs.mkdir(baseDir, { recursive: true });
    await fs.mkdir(historyDir, { recursive: true });

    const mainFilePath = path.join(baseDir, `mock-workflow-${templateId}.json`);

    // 2. Đối soát phiên bản: Đọc file cũ nếu có để tăng số version
    let currentVersion = 1;
    try {
      let existingRaw: string | null = null;
      try {
        existingRaw = await fs.readFile(mainFilePath, "utf-8");
      } catch {
        // Fallback đọc file mock gốc ban đầu nếu mainFilePath chưa được tạo
        if (templateId === "tpl_01_lptb") {
          try {
            existingRaw = await fs.readFile(path.join(baseDir, "mock-workflow-01-lptb.json"), "utf-8");
          } catch {}
        } else if (templateId === "tpl_03_khai_sinh") {
          try {
            existingRaw = await fs.readFile(path.join(baseDir, "mock-workflow-khai-sinh-lai.json"), "utf-8");
          } catch {}
        }
      }

      if (existingRaw) {
        const existingData = JSON.parse(existingRaw) as FormWorkflow;
        if (existingData.version && typeof existingData.version === "number") {
          currentVersion = existingData.version + 1;
        } else {
          currentVersion = 2;
        }
      }
    } catch {
      // File chưa tồn tại, bắt đầu từ version 1
      currentVersion = 1;
    }

    // 3. Gán metadata phiên bản mới nhất
    const publishedWorkflow: FormWorkflow = {
      ...body,
      status: "ACTIVE",
      version: currentVersion,
      publishedAt: new Date().toISOString(),
      totalSteps: body.steps.length,
      // Đảm bảo đánh số lại stepIndex chuẩn xác từ 0 đến N-1
      steps: body.steps.map((step, idx) => ({
        ...step,
        stepIndex: idx,
      })),
    };

    const jsonString = JSON.stringify(publishedWorkflow, null, 2);

    // 4. Ghi file chính thức (Bản mới nhất được dùng cho Citizen)
    await fs.writeFile(mainFilePath, jsonString, "utf-8");

    // Đồng bộ đồng thời vào file mock ban đầu để giữ tính nhất quán
    if (templateId === "tpl_01_lptb") {
      try {
        await fs.writeFile(path.join(baseDir, "mock-workflow-01-lptb.json"), jsonString, "utf-8");
      } catch {}
    } else if (templateId === "tpl_03_khai_sinh") {
      try {
        await fs.writeFile(path.join(baseDir, "mock-workflow-khai-sinh-lai.json"), jsonString, "utf-8");
      } catch {}
    }

    // 5. Ghi bản sao lưu lịch sử phiên bản
    const historyFilePath = path.join(historyDir, `${templateId}-v${currentVersion}.json`);
    await fs.writeFile(historyFilePath, jsonString, "utf-8");

    return NextResponse.json({
      success: true,
      message: `Đã xuất bản thành công phiên bản v${currentVersion}`,
      version: currentVersion,
      publishedAt: publishedWorkflow.publishedAt,
      mainFilePath: `assets/mock-data/mock-workflow-${templateId}.json`,
      workflow: publishedWorkflow,
    });
  } catch (error: any) {
    console.error("Lỗi khi ghi file workflow JSON:", error);
    return NextResponse.json(
      { error: "Không thể lưu file JSON xuống đĩa", details: error.message },
      { status: 500 }
    );
  }
}
