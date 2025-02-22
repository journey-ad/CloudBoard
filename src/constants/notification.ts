export const NOTIFICATION = {
  SUCCESS: "Success",
  ERROR: "Error",
  WARNING: "Warning",
  INFO: "Info",
  
  INVALID_API_ENDPOINT: "Invalid API Endpoint",
  GET_CONFIG_FAILED: "Failed to get API configuration",
  GET_CONFIG_SUCCESS: "API configuration loaded successfully",
  API_KEY_COPIED: "API Key has been copied to the clipboard",
  CLIPBOARD_UPLOAD_FAILED: "Failed to upload clipboard data",
  CLIPBOARD_UPLOAD_SUCCESS: "Clipboard data uploaded successfully",
  SYNC_PAUSED: "Clipboard sync has been paused",
  SYNC_RESUMED: "Clipboard sync has been resumed",
} as const;
