// Undo. Every action that changes the map pushes the work that would put it
// back; Ctrl-Z pops one and runs it. Steps are recorded as inverse operations
// rather than snapshots, so undoing a title edit does not also undo a drag that
// happened after it.
//
// A step is data, not a function: whoever sets the stack up says how to carry
// one out. That is what lets the history be written down, and survive a
// refresh along with the changes it would undo.

const steps = [];
const MAX_STEPS = 100;

/** Marks pushed by the caller, so a whole edit session can be unwound at once. */
let running = false;

let apply = async () => {};
let onChange = () => {};

/**
 * @param handlers.apply    carries out the undo data of one step
 * @param handlers.onChange hears that the stack has moved, to keep a copy of it
 */
export function init(handlers) {
  apply = handlers.apply;
  onChange = handlers.onChange ?? onChange;
}

/**
 * Record one undoable step.
 * @param label what the step did, for the status line
 * @param undo  plain data that reverses it, handed to `apply` — no functions,
 *              so the step can be stored
 */
export function record(label, undo) {
  if (running) return; // an undo must not record itself
  steps.push({ label, undo, mark: null });
  if (steps.length > MAX_STEPS) steps.shift();
  onChange();
}

/** Drop a marker to unwind back to later — used when an edit session opens. */
export function mark(name) {
  steps.push({ label: name, undo: null, mark: name });
}

export function canUndo() {
  return steps.some((step) => step.undo);
}

/** Undo the most recent step. Returns its label, or null if there was nothing. */
export async function undo() {
  while (steps.length > 0) {
    const step = steps.pop();
    if (!step.undo) continue; // a bare marker: skip it
    running = true;
    try {
      await apply(step.undo);
      return step.label;
    } finally {
      running = false;
      onChange();
    }
  }
  return null;
}

/**
 * Unwind every step back to a marker — what Cancel does at the end of an edit
 * session. Returns how many steps were reversed.
 */
export async function rewindTo(name) {
  let count = 0;
  while (steps.length > 0) {
    const step = steps.pop();
    if (step.mark === name) break;
    if (!step.undo) continue;
    running = true;
    try {
      await apply(step.undo);
      count += 1;
    } finally {
      running = false;
    }
  }
  onChange();
  return count;
}

/** Forget a marker without undoing anything — what Save does. */
export function dropMark(name) {
  const at = steps.findLastIndex((step) => step.mark === name);
  if (at >= 0) steps.splice(at, 1);
}

export function clear() {
  steps.length = 0;
  onChange();
}

/**
 * The stack as it can be kept. Markers stay behind: the edit session one opens
 * does not outlive the page, so there would be nothing left to cancel.
 */
export const kept = () => steps.filter((step) => step.mark === null);

/** Take up a stack that `kept` wrote, in place of the one there is. */
export function load(list) {
  steps.length = 0;
  if (Array.isArray(list)) steps.push(...list.filter((step) => step?.undo).slice(-MAX_STEPS));
  onChange();
}
