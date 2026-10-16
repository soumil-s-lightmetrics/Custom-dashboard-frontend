/**
 * Turn a suggested report's questionTemplate into the question we actually ask.
 *
 * Mirrors assemble_question() in backend/suggested_reports.py. The backend copy
 * is the one under test (test_suggested_reports.py); this is the one that runs.
 * Keep the two in step — the placeholder syntax is {name} in both.
 *
 * A blank value deliberately leaves the {placeholder} in place rather than
 * producing a mangled sentence: the UI requires every declared param, so a
 * blank getting this far is a bug, and a visible {asset} says so loudly.
 */
export function assembleQuestion(report, values) {
  const template = report?.query?.questionTemplate || "";
  return template.replace(/\{(\w+)\}/g, (whole, key) => {
    const value = values?.[key];
    return value && String(value).trim() ? String(value).trim() : whole;
  });
}
