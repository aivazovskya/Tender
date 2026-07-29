export interface TenderFieldChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

export const TRACKED_FIELDS = [
  'deadlineDate',
  'amount',
  'status',
  'title',
  'applicationSecurityAmount',
  'region',
  'customerName'
] as const;

/**
 * Compares two tender objects and returns an array of field-level changes
 * for specified tracked fields.
 */
export function diffTenderFields(
  oldTender: Record<string, any>,
  newTender: Record<string, any>
): TenderFieldChange[] {
  const changes: TenderFieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    const oldVal = oldTender[field];
    const newVal = newTender[field];

    if (oldVal === undefined && newVal === undefined) continue;

    let oldStr: string | null = null;
    let newStr: string | null = null;

    if (oldVal !== null && oldVal !== undefined) {
      if (oldVal instanceof Date) {
        oldStr = oldVal.toISOString();
      } else {
        oldStr = String(oldVal);
      }
    }

    if (newVal !== null && newVal !== undefined) {
      if (newVal instanceof Date) {
        newStr = newVal.toISOString();
      } else if (typeof newVal === 'string' && !isNaN(Date.parse(newVal)) && (field === 'deadlineDate' || field === 'publishDate')) {
        newStr = new Date(newVal).toISOString();
      } else {
        newStr = String(newVal);
      }
    }

    // Normalize comparison for dates
    if (field === 'deadlineDate' && oldStr && newStr) {
      const oldTime = new Date(oldStr).getTime();
      const newTime = new Date(newStr).getTime();
      if (!isNaN(oldTime) && !isNaN(newTime) && oldTime === newTime) {
        continue;
      }
    }

    // Compare numeric amounts accurately
    if ((field === 'amount' || field === 'applicationSecurityAmount') && oldVal != null && newVal != null) {
      if (Number(oldVal) === Number(newVal)) {
        continue;
      }
    }

    if (oldStr !== newStr) {
      changes.push({
        field,
        oldValue: oldStr,
        newValue: newStr
      });
    }
  }

  return changes;
}
