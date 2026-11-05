/** The message delivered back into the session once every question has an answer. */
export function answeredText(questions, answers) {
    const lines = questions.map((q, i) => `"${q.question}"="${answers[i]?.length ? answers[i].join(", ") : "Unanswered"}"`);
    return `The user answered your background questions: ${lines.join(", ")}. You can now continue with the user's answers in mind.`;
}
/** The message delivered when the user closes the dialog without answering. */
export function dismissedText(questions) {
    const summary = questions.map((q) => q.question).join("; ") || "your question";
    return `Your background question (${summary}) was dismissed without an answer.`;
}
