import { v4 as uuidv4 } from 'uuid';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';

const s3Client = new S3Client({});
const dynamoDbClient = new DynamoDBClient({});
const BUCKET_NAME = process.env.UPLOAD_BUCKET_NAME;
const TABLE_NAME = process.env.INVOICE_TABLE_NAME;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
  if (!event.body) {
    return { statusCode: 400, body: JSON.stringify({ message: 'Cuerpo de la petición vacío.' }) };
  }

  try {
    const { format } = JSON.parse(event.body);

    if (!format) {
      return { statusCode: 400, body: JSON.stringify({ message: 'Debe indicar el formato del archivo a cargar' }) };
    }

    const fileId = uuidv4();
    const objectKey = `${fileId}.${format}`;

    // 1. Guardar metadatos en DynamoDB
    const putCommand = new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        id: fileId,
        createdAt: new Date().toISOString(),
      },
    });
    await dynamoDbClient.send(putCommand);

    // 2. Generar URL prefirmada para S3
    const s3Command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: objectKey,
      ContentType: 'image/jpeg',
    });
    const signedUrl = await getSignedUrl(s3Client, s3Command, { expiresIn: 300 });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({
        uploadUrl: signedUrl,
        fileId: fileId,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ message: 'Error interno del servidor.' }),
    };
  }
};