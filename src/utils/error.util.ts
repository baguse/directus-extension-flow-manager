export interface FormattedError {
  message: string;
  status?: number;
  code?: string;
  details?: string;
}

/**
 * Extracts structured and user-friendly error details from Axios, Directus, or generic errors.
 */
export function extractErrorDetails(err: unknown): FormattedError {
  const anyErr = err as {
    response?: {
      data?: {
        error?:
          | string
          | {
              message?: string;
              errors?: { message?: string; extensions?: { code?: string } }[];
            };
        message?: string;
        errors?: { message?: string; extensions?: { code?: string } }[];
        status?: number;
        code?: string;
      };
      status?: number;
      statusText?: string;
    };
    message?: string;
    code?: string;
  };

  const status = anyErr?.response?.data?.status ?? anyErr?.response?.status;
  const code = anyErr?.response?.data?.code ?? anyErr?.code;
  const remoteData = anyErr?.response?.data;
  const remoteError = remoteData?.error;

  let directusMessage = '';

  // 1. Directus standard errors array: { errors: [{ message, extensions }] }
  const errorsArray =
    typeof remoteError === 'object' &&
    remoteError !== null &&
    'errors' in remoteError &&
    Array.isArray(remoteError.errors)
      ? remoteError.errors
      : Array.isArray(remoteData?.errors)
        ? remoteData.errors
        : undefined;

  if (errorsArray && errorsArray.length > 0 && errorsArray[0]?.message) {
    directusMessage = errorsArray[0].message;
  } else if (
    typeof remoteError === 'object' &&
    remoteError !== null &&
    'message' in remoteError &&
    typeof remoteError.message === 'string'
  ) {
    directusMessage = remoteError.message;
  } else if (typeof remoteData?.message === 'string' && remoteData.message !== '') {
    directusMessage = remoteData.message;
  } else if (typeof remoteError === 'string') {
    directusMessage = remoteError;
  }

  // 2. HTTP Status-specific messages
  if (status === 401) {
    return {
      message: 'Authentication failed (401 Unauthorized): Invalid or expired static token.',
      status,
      code,
      details: directusMessage,
    };
  }

  if (status === 403) {
    return {
      message:
        'Access forbidden (403 Forbidden): Token lacks permissions to access resources on this instance.',
      status,
      code,
      details: directusMessage,
    };
  }

  if (status === 404) {
    return {
      message: 'Instance not found (404 Not Found): Directus API was not found at this URL.',
      status,
      code,
      details: directusMessage,
    };
  }

  if (status && status >= 500 && status <= 504) {
    const defaultMsg =
      status === 502 || status === 503 || status === 504
        ? `Remote server unavailable (${status}): The instance is offline, unreachable, or timed out.`
        : `Remote server error (${status}): The remote Directus instance encountered an internal error.`;

    return {
      message: directusMessage ? `${defaultMsg} (${directusMessage})` : defaultMsg,
      status,
      code,
      details: directusMessage,
    };
  }

  // 3. Network and Socket level errors
  const errMessage = (anyErr?.message || '').toLowerCase();
  const rawCode = (code || '').toUpperCase();
  const remoteErrStr = typeof remoteError === 'string' ? remoteError.toLowerCase() : '';

  if (
    rawCode === 'ECONNREFUSED' ||
    errMessage.includes('econnrefused') ||
    remoteErrStr.includes('econnrefused')
  ) {
    return {
      message:
        'Connection refused (ECONNREFUSED): Unable to connect to host. Check that Directus is running and the port is open.',
      status,
      code: 'ECONNREFUSED',
      details: directusMessage || anyErr?.message,
    };
  }

  if (
    rawCode === 'ENOTFOUND' ||
    errMessage.includes('enotfound') ||
    remoteErrStr.includes('enotfound')
  ) {
    return {
      message:
        'Host not found (ENOTFOUND): Domain or IP address could not be resolved. Please verify the URL.',
      status,
      code: 'ENOTFOUND',
      details: directusMessage || anyErr?.message,
    };
  }

  if (
    rawCode === 'ETIMEDOUT' ||
    rawCode === 'ECONNABORTED' ||
    errMessage.includes('timeout') ||
    errMessage.includes('timedout') ||
    remoteErrStr.includes('timeout')
  ) {
    return {
      message:
        'Connection timed out: The remote instance took too long to respond. Please check network latency or firewall rules.',
      status,
      code: 'ETIMEDOUT',
      details: directusMessage || anyErr?.message,
    };
  }

  if (rawCode === 'ERR_NETWORK' || errMessage.includes('network error')) {
    return {
      message:
        'Network error: Unable to reach the server. Please check your network connection or CORS settings.',
      status,
      code: 'ERR_NETWORK',
      details: directusMessage || anyErr?.message,
    };
  }

  if (
    rawCode.includes('CERT') ||
    errMessage.includes('certificate') ||
    errMessage.includes('self_signed') ||
    errMessage.includes('depth_zero_self_signed_cert')
  ) {
    return {
      message:
        'SSL/TLS certificate error: Unable to verify certificate. Ensure the HTTPS certificate is valid.',
      status,
      code: rawCode || 'CERT_ERROR',
      details: directusMessage || anyErr?.message,
    };
  }

  // 4. Directus error message if available
  if (directusMessage) {
    return {
      message: directusMessage,
      status,
      code,
      details: directusMessage,
    };
  }

  // 5. General message fallback
  if (anyErr?.message) {
    return {
      message: anyErr.message,
      status,
      code,
    };
  }

  return {
    message: 'Unknown error occurred while connecting to the instance.',
    status,
    code,
  };
}

/**
 * Returns a human-readable error string suitable for UI notices and alerts.
 */
export function formatConnectionError(
  err: unknown,
  fallback = 'Failed to connect to the external Directus instance.',
): string {
  const extracted = extractErrorDetails(err);
  return extracted.message || fallback;
}
