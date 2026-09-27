import { NextRequest, NextResponse } from 'next/server';
import { documentExtractionService } from '@/modules/documents/services/document-extraction.service';

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') || '';

    let imageBase64 = '';
    let documentHint = 'auto';
    let deskewApplied = true;

    if (contentType.includes('application/json')) {
      const body = await req.json();
      imageBase64 = body.imageBase64 || '';
      documentHint = body.documentHint || 'auto';
      deskewApplied = body.deskewApplied ?? true;
    } else if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      documentHint = (formData.get('documentHint') as string) || 'auto';
      const deskewFlag = formData.get('deskewApplied');
      if (deskewFlag !== null) {
        deskewApplied = deskewFlag === 'true';
      }

      if (file) {
        const buffer = await file.arrayBuffer();
        const bytes = Buffer.from(buffer);
        imageBase64 = `data:${file.type || 'image/jpeg'};base64,${bytes.toString('base64')}`;
      }
    } else {
      return NextResponse.json(
        { success: false, error: 'Định dạng yêu cầu không hỗ trợ. Vui lòng gửi JSON hoặc multipart/form-data.' },
        { status: 400 }
      );
    }

    if (!imageBase64 || imageBase64.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Vui lòng cung cấp dữ liệu hình ảnh (imageBase64 hoặc file).' },
        { status: 400 }
      );
    }

    const result = await documentExtractionService.extractDocumentInformation({
      imageBase64,
      documentHint,
      deskewApplied,
    });

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[API /api/documents/extract] Lỗi xử lý:', error);
    return NextResponse.json(
      {
        success: false,
        error: (error as Error).message || 'Lỗi xử lý nội bộ khi trích xuất tài liệu',
      },
      { status: 500 }
    );
  }
}
