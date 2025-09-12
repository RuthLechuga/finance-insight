import { parseInvoice } from './utils/textract-parser';
import { TextractClient, AnalyzeExpenseCommand } from '@aws-sdk/client-textract';

const textractClient = new TextractClient({});

interface InputEvent {
  bucketName: string;
  objectKey: string;
}

export const handler = async (event: InputEvent) => {
  const analyzeCommand = new AnalyzeExpenseCommand({
    Document: { S3Object: { Bucket: event.bucketName, Name: event.objectKey } }
  });
  
  const response = await textractClient.send(analyzeCommand);
  const invoiceData = parseInvoice(response);

  return {
    sourceObject: event,
    extractedData: invoiceData
  };
};