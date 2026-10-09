import fs from 'node:fs';
import path from 'node:path';
import { fixtures, evaluateFixedFixture, visibleTranscript, ocrMetrics, auditSourceCoverage } from '@/modules/documents/json-evaluation';
import { handleJsonConversion } from '@/modules/documents/json-api';
import { JsonExportService } from '@/modules/documents/services/json-export.service';
import { VietOcrProvider } from '@/modules/documents/providers/vietocr-provider';
import { validateJsonExport } from '@/modules/documents/json-validator';
import type { DocumentOcrResult } from '@/shared/document-extraction.types';
const directory='docs/ocr-json-evaluation/results';
fs.mkdirSync(directory,{recursive:true});
const layerA=Object.values(fixtures).map(f=>{
  const {document,...result}=evaluateFixedFixture(f);return result;
});
fs.writeFileSync(path.join(directory,'fixed-ocr-results.json'),JSON.stringify({layer:'A',description:'Fixed transcripts and explicitly simulated provider layout, no OCR invoked',results:layerA},null,2)+'\n');
console.log('Layer A: '+layerA.length+' fixtures PASS (fixed OCR only).');
if(process.argv.includes('--rescore')) {
  const file=path.join(directory,'live-results.json'), report=JSON.parse(fs.readFileSync(file,'utf8'));
  for(const result of report.results) {
    const fixture=fixtures[result.fixture];
    if(result.cer!==null && fixture) Object.assign(result,ocrMetrics(visibleTranscript(fixture).join('\n'),result.actualText));
  }
  report.rescoredFromSavedOcr=true;
  fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
  console.log('Rescored saved real OCR against corrected visible transcripts; no provider call.');
}
if(process.argv.includes('--live')) {
  const endpoint=new URL(process.env.VIETOCR_ENDPOINT||'http://127.0.0.1:8000/predict');
  if(!['127.0.0.1','localhost','[::1]'].includes(endpoint.hostname)||endpoint.protocol!=='http:')throw new Error('LOCAL_VIETOCR_ONLY_NO_PAID_PROVIDER');
  const health=new URL('/health',endpoint), results: unknown[]=[];
  let ready=false,blockedReason='';
  try { const response=await fetch(health,{signal:AbortSignal.timeout(3000)}),data=await response.json();ready=response.ok&&data.ready===true;blockedReason=ready?'':'VIETOCR_MODEL_NOT_READY'; }
  catch(error){blockedReason='VIETOCR_HEALTH_UNAVAILABLE:'+ (error instanceof Error?error.name:'unknown');}
  for(const fixture of Object.values(fixtures)) {
    if(!ready){results.push({fixture:fixture.id,layer:'B_IMAGE_TO_OCR_TO_JSON',status:'BLOCKED',provider:'vietocr-local',reason:blockedReason,cer:null,wer:null});continue;}
    const attempts:(DocumentOcrResult|null)[]=[],provider=new VietOcrProvider({endpoint:endpoint.href});
    const bytes=fs.readFileSync(path.join('tests/fixtures/ocr-json',fixture.filename)),form=new FormData();
    form.set('file',new Blob([bytes],{type:'image/png'}),fixture.filename);
    form.set('deskewApplied','false');
    const response=await handleJsonConversion(new Request('http://localhost/api/documents/json',{method:'POST',body:form}),()=>new JsonExportService({
      providerId:'vietocr',extract:async input=>{try{const result=await provider.extract(input);attempts.push(result);return result;}catch(error){attempts.push(null);throw error;}}
    }));
    const payload=await response.json(),document=payload.data;
    let preservation=false,validation=null;
    if(document) {
      validation=validateJsonExport(document);
      const selected=attempts[(document.review.selectedAttempt??0)-1];
      if(selected){auditSourceCoverage(selected,document);preservation=true;}
      fs.writeFileSync(path.join(directory,fixture.id.toLowerCase()+'-live.json'),JSON.stringify(document,null,2)+'\n');
    }
    const serviceFailure=!response.ok&&payload.error?.code!=='OCR_EMPTY_TEXT';
    const actual=document?.rawText??'',expected=visibleTranscript(fixture).join('\n');
    const eligible=fixture.id!=='TC02'&&fixture.id!=='TC10'&&!serviceFailure;
    const metrics=eligible?ocrMetrics(expected,actual):{cer:null,wer:null};
    const findings=[];
    if(document) for(const relation of fixture.structuralRelationships.filter(r=>r.type==='field_label_value'&&r.label)) {
      const key=(s:string)=>s.normalize('NFC').replace(/^\d+\.\s*/u,'').trim().toLocaleLowerCase('vi');
      const field=document.structure.fields.find((f:{label:string})=>key(f.label)===key(relation.label!));
      const expectedValue=relation.value??null,actualValue=field?.normalizedValue?.trim()??null;
      if(actualValue!==expectedValue) findings.push({label:relation.label,expected:expectedValue,actual:actualValue,category:!field&&expectedValue&&actual.includes(expectedValue)?'JSON_FIELD_NOT_EXTRACTED':'OCR_OR_GROUND_TRUTH_DIFFERENCE'});
    }
    const result={fixture:fixture.id,layer:'B_IMAGE_TO_OCR_TO_JSON',provider:'vietocr-local',status:serviceFailure?'BLOCKED':fixture.id==='TC10'?!actual?'PASS_NEGATIVE_BLANK':'FAIL_INVENTED_TEXT':metrics.cer===0&&findings.length===0?'EXACT_TRANSCRIPT_MATCH':'OCR_DIFFERENCES_REVIEW',
      httpStatus:response.status,documentStatus:document?.status??null,errorCode:payload.error?.code??null,
      ...metrics,metricScope:eligible?'NFC and collapsed whitespace, manually reviewed visible transcript':fixture.id==='TC02'?'CER/WER excluded: clipped dotted padding, exact visible dot count unverified':'No CER/WER for empty transcript or service failure',
      sourcePreserved:preservation,schemaValid:validation?.valid??null,fieldFindings:findings,attempts:attempts.length,deskewApplied:false,
      unsupportedLayout:fixture.id==='TC04'?'Local provider has no table detector: tables stay empty':fixture.id==='TC05'?'Checkbox OCR symbols are unverified text evidence':fixture.id==='TC07'?'Rotation only; no browser perspective preprocessing in this provider integration':null,
      actualText:actual};
    results.push(result);console.log(fixture.id+': '+result.status+' CER='+result.cer+' WER='+result.wer+' source='+result.sourcePreserved);
    fs.writeFileSync(path.join(directory,'live-results.json'),JSON.stringify({layer:'B',syntheticOnly:true,provider:'vietocr-local',httpRouteHandlerExecuted:true,browserPreprocessing:false,results},null,2)+'\n');
  }
  fs.writeFileSync(path.join(directory,'live-results.json'),JSON.stringify({layer:'B',syntheticOnly:true,provider:'vietocr-local',httpRouteHandlerExecuted:true,browserPreprocessing:false,results},null,2)+'\n');
}
