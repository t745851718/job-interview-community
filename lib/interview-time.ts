/** datetime-local input is explicitly entered in Beijing time (UTC+08:00). */
export function resolveInterviewTime(value: unknown, submittedAt: number): number {
  if (value === null || value === undefined || value === '') return submittedAt;
  if (typeof value !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}$/.test(value) || value.startsWith('0000')) {
    throw new Error('请选择有效的面试时间');
  }
  const timestamp = Date.parse(`${value}:00+08:00`);
  // Date.parse may normalize invalid days, so also verify the calendar round trip.
  if (!Number.isFinite(timestamp) || new Date(timestamp + 8 * 3600000).toISOString().slice(0, 16) !== value) {
    throw new Error('请选择有效的面试时间');
  }
  return timestamp;
}
