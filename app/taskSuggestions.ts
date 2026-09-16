/**
 * Starter steps for tasks people have before.
 *
 * Most of what stalls a student is not exotic. "Write the essay", "tidy my
 * room", "apply for the job" come up again and again, and the useful
 * breakdown for each is roughly the same every time — so there is no reason to
 * pay a model to reinvent it, wait two seconds for the answer, or spend one of
 * the day's AI calls on it.
 *
 * These are offered as taps, not applied automatically. The person knows what
 * their task actually involves; this is a menu, not an answer.
 *
 * Every list follows the same rule as the model's prompt: the first step is
 * almost trivially small, and each one is a physical action rather than a
 * phase. "Research" is not a step. "Open the reading list and pick three" is.
 */

export interface TaskSuggestion {
  /** Shown above the chips, so it is obvious why these appeared. */
  label: string;
  steps: string[];
}

interface Pattern extends TaskSuggestion {
  match: RegExp;
}

const PATTERNS: Pattern[] = [
  {
    match: /\b(essay|assignment|report|coursework|dissertation|thesis|paper)\b/i,
    label: 'Written work',
    steps: [
      'Open the brief and read it once',
      'Write the section headings',
      'Put three bullet points under each',
      'Write the worst possible first paragraph',
      'Fill in the section you understand best',
      'Check the references',
    ],
  },
  {
    match: /\b(revise|revision|exam|study|studying|test)\b/i,
    label: 'Revision',
    steps: [
      'Find the syllabus or past paper',
      'List the topics on one page',
      'Mark the three you understand least',
      'Do twenty minutes on the first one',
      'Write down what you got wrong',
    ],
  },
  {
    match: /\b(app|code|coding|build|feature|bug|website|project)\b/i,
    label: 'Building something',
    steps: [
      'Open the editor',
      'Write down the one thing it should do next',
      'Make the smallest change that moves toward it',
      'Run it and see what breaks',
      'Commit what works',
    ],
  },
  {
    match: /\b(presentation|slides|talk|pitch|seminar)\b/i,
    label: 'Presentation',
    steps: [
      'Write the one sentence you want them to remember',
      'List the three points that support it',
      'Make one slide per point, words only',
      'Say it out loud once, badly',
      'Fix only what tripped you up',
    ],
  },
  {
    match: /\b(clean|tidy|declutter|room|kitchen|bedroom|desk)\b/i,
    label: 'Tidying',
    steps: [
      'Set a timer for fifteen minutes',
      'Put all the rubbish in one bag',
      'Put all the cups and plates in the kitchen',
      'Clear one flat surface completely',
      'Put the washing in a pile',
    ],
  },
  {
    match: /\b(laundry|washing|clothes)\b/i,
    label: 'Laundry',
    steps: [
      'Gather what needs washing into one pile',
      'Put a load on',
      'Set a reminder for when it finishes',
      'Hang it up or put it in the dryer',
      'Put away what is already dry',
    ],
  },
  {
    match: /\b(apply|application|cv|resume|cover letter|job|internship)\b/i,
    label: 'Applying for something',
    steps: [
      'Open the job posting and save it',
      'Copy your CV into a new file',
      'Change the top three bullets to match the posting',
      'Write one paragraph on why this one',
      'Reread the posting and check you answered it',
      'Send it',
    ],
  },
  {
    match: /\b(email|emails|inbox|reply|admin|forms?|paperwork)\b/i,
    label: 'Admin',
    steps: [
      'Open the inbox and read only the subject lines',
      'Star the three that actually need you',
      'Reply to the quickest one',
      'Reply to the one you have been avoiding',
      'Archive everything else',
    ],
  },
  {
    match: /\b(shop|shopping|groceries|food|meal)\b/i,
    label: 'Food shopping',
    steps: [
      'Look in the fridge',
      'Write down five things you actually eat',
      'Check what you already have',
      'Order it or put your shoes on',
    ],
  },
  {
    match: /\b(read|reading|book|chapter|article|paper)\b/i,
    label: 'Reading',
    steps: [
      'Put the phone in another room',
      'Open it to where you stopped',
      'Read one page',
      'Write one sentence about what it said',
    ],
  },
];

/**
 * The best-matching set of starter steps, if any.
 *
 * First match wins rather than merging several — a task called "write the
 * report and tidy my desk" is two tasks, and offering eleven mixed steps would
 * be its own kind of unhelpful.
 */
export function suggestSteps(taskName: string): TaskSuggestion | null {
  const name = taskName.trim();
  if (name.length < 3) return null;
  const hit = PATTERNS.find((p) => p.match.test(name));
  return hit ? { label: hit.label, steps: hit.steps } : null;
}
