/**
 * Parsear información de factura
 */
export function parseInvoice(response: any) {
  const expenseDoc = response.ExpenseDocuments?.[0];
  if (!expenseDoc) return {};

  const summary: { [key: string]: string | undefined } = {};
  const lineItems: any[] = [];

  expenseDoc.SummaryFields?.forEach((field: any) => {
    const fieldType = field.Type?.Text;
    const fieldValue = field.ValueDetection?.Text;
    if (fieldType) {
      summary[fieldType] = fieldValue;
    }
  });

  expenseDoc.LineItemGroups?.[0]?.LineItems.forEach((item: any) => {
    const lineItem: { [key: string]: string | undefined } = {};
    item.LineItemExpenseFields?.forEach((field: any) => {
      const fieldType = field.Type?.Text;
      const fieldValue = field.ValueDetection?.Text;
      if (fieldType) {
        lineItem[fieldType] = fieldValue;
      }
    });
    lineItems.push(lineItem);
  });
  
  return { summary, lineItems };
}