/** The host's own `question` tool makes forms with this metadata; the dock and the attention mark key on it. */
export const FORM_TITLE = "Questions";
export const fieldKey = (index) => `q${index}`;
/** One field per question, the same mapping the built-in `question` tool uses: header → title, question → description. */
export function toFields(questions) {
    const fields = questions.map((q, i) => ({
        key: fieldKey(i),
        type: q.multiple ? "multiselect" : "string",
        title: q.header,
        description: q.question,
        options: q.options.map((o) => ({ value: o.label, label: o.label, description: o.description })),
        custom: true,
    }));
    return fields;
}
export function formMetadata(requestID, messageID, callID) {
    return { kind: "question", requestID, tool: { messageID, id: callID } };
}
/** A form answer ({q0: "Dark", q1: ["A", "B"]}) as one array of chosen labels or typed text per question, in order. */
export function answersFromForm(questions, answer) {
    return questions.map((_, i) => {
        const value = answer[fieldKey(i)];
        if (Array.isArray(value))
            return value.map(String);
        if (value === undefined || value === null || value === "")
            return [];
        return [String(value)];
    });
}
/** The message delivered back into the session once every question has an answer. */
export function answeredText(questions, answers) {
    const lines = questions.map((q, i) => `"${q.question}"="${answers[i]?.length ? answers[i].join(", ") : "Unanswered"}"`);
    return `The user answered your background questions: ${lines.join(", ")}. You can now continue with the user's answers in mind.`;
}
/** The message delivered when the user dismisses the question without answering. */
export function dismissedText(questions) {
    const summary = questions.map((q) => q.question).join("; ") || "your question";
    return `Your background question (${summary}) was dismissed without an answer.`;
}
/** The message delivered when no window could show the question. */
export function failedText(questions, reason) {
    const summary = questions.map((q) => q.question).join("; ") || "your question";
    return `Your background question (${summary}) could not be shown to the user: ${reason}`;
}
