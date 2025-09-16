import { DynamoDBDocumentClient, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

interface InputEvent {
  sourceObject: {
    bucketName: string;
    objectKey: string;
    fileId: string;
  };
  extractedData: any;
  vendorCategory: string;
}

const ddbClient = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(ddbClient);

const INVOICE_TABLE_NAME = process.env.INVOICE_TABLE_NAME;

export const handler = async (event: InputEvent) => {
    console.log("Evento recibido:", JSON.stringify(event, null, 2));

    if (!INVOICE_TABLE_NAME) {
        throw new Error("La variable de entorno INVOICE_TABLE_NAME no está configurada.");
    }

    try {
        const fileId = event.sourceObject.fileId;
        const summary = event.extractedData.summary;
        const lineItems = event.extractedData.lineItems;
        const vendorCategory = event.vendorCategory || 'General';

        if (!fileId || !summary || !lineItems) {
          throw new Error("El evento de entrada no contiene los datos necesarios (fileId, summary, lineItems).");
        }

        const receiptDate = summary.INVOICE_RECEIPT_DATE;
        const total = parseFloat(summary.TOTAL);
        const store = summary.VENDOR_NAME.replace(/\n/g, ' ');

        const products = lineItems.map((item: any) => ({
            ITEM: item.ITEM,
            PRICE: parseFloat(item.PRICE),
            QUANTITY: item.QUANTITY || '1'
        }));

        const command = new UpdateCommand({
            TableName: INVOICE_TABLE_NAME,
            Key: {
                id: fileId
            },
            UpdateExpression: "SET #receiptDate = :receiptDate, #total = :total, #store = :store, #products = :products, #vendorCategory = :vendorCategory",
            ExpressionAttributeNames: {
              '#receiptDate': 'receiptDate',
              '#total': 'total',
              '#store': 'store',
              '#products': 'products',
              '#vendorCategory': 'vendorCategory'
            },
            ExpressionAttributeValues: {
              ':receiptDate': receiptDate,
              ':total': total,
              ':store': store,
              ':products': products,
              ':vendorCategory': vendorCategory
            }
        });

        await docClient.send(command);

        console.log(`Registro de factura con id '${fileId}' actualizado exitosamente.`);
        return event;

    } catch (error) {
        console.error("Error al actualizar el registro en DynamoDB:", error);
        throw error; // Lanzar el error para que la Step Function lo marque como fallido
    }
};