/** Uniform error envelope: {"error": {"code", "message", "upstreamStatus"}}. */

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public upstreamStatus: number | null = null,
  ) {
    super(message);
  }

  toJSON() {
    return {
      error: { code: this.code, message: this.message, upstreamStatus: this.upstreamStatus },
    };
  }
}

export const notFound = (what: string) => new ApiError("not_found", `No such ${what}`, 404);

/** The deployed custom-reports API rejected or failed the call. */
export function upstreamErrorFromResponse(status: number, body: string): ApiError {
  if (status === 403) {
    return new ApiError(
      "upstream_unauthorized",
      "Upstream rejected the access token. Check CD_LM_ACCESS_TOKEN.",
      502,
      403,
    );
  }
  if (status === 400) {
    return new ApiError(
      "upstream_bad_request",
      `Upstream rejected the request: ${body.slice(0, 300)}`,
      502,
      400,
    );
  }
  return new ApiError("upstream_error", `Upstream returned ${status}: ${body.slice(0, 300)}`, 502, status);
}

export function upstreamTimeout(seconds: number): ApiError {
  return new ApiError(
    "upstream_timeout",
    `Upstream did not respond within ${seconds}s. The question may be too broad — try narrowing it.`,
    504,
  );
}
