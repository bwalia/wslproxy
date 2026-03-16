// HTTP client utilities extracted from dataProvider

export const getHeaders = (): Record<string, string> => {
  const basicHeaders: Record<string, string> = { "x-platform": "react-admin" };
  try {
    const token = localStorage.getItem("token");
    if (token) {
      const accessToken = JSON.parse(token);
      if (accessToken?.accessToken) {
        basicHeaders.Authorization = `Bearer ${accessToken.accessToken}`;
      }
    }
  } catch {
    // Silently handle missing or malformed token
  }
  return basicHeaders;
};

/**
 * Encodes special characters that may interfere with API payload parsing.
 * Replaces &, +, and = with their Unicode escape sequences.
 */
export const encodeSpecialChars = (data: string): string => {
  return data
    .replace("&", "\\u0026")
    .replaceAll("+", "\\u002B")
    .replaceAll("=", "\\u003D");
};
