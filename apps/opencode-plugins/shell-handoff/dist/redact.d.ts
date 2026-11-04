/**
 * Command text is written to a file and into the session, so secrets in it must not survive. Blindfold redacts values it
 * knows; here nothing is known, so this matches the shapes secrets take on a command line. It errs toward hiding: a
 * redacted word costs the reader a guess, a leaked token costs more.
 */
export declare function redact(text: string): string;
