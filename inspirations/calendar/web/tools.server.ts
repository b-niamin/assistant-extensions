/**
 * Placeholder tools until the extension is built (spec 005 of the core): the read-only `overview` every
 * extension gives the AI. Replace it with a real summary, and add one tool per write (readOnly: false).
 */
import type { ExtTool } from '$shell';

export const tools: ExtTool[] = [
  {
    name: 'overview',
    title: 'Up next',
    readOnly: true,
    description: 'The next events from the connected calendars. Not built yet: says so.',
    input: { type: 'object', properties: {} },
    run: () => ({ ready: false, message: 'No calendar connected yet.' })
  }
];
