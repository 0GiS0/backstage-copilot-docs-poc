export interface Config {
  copilotChat?: {
    /** Model used when the client does not request one. */
    defaultModel?: string;
    /** Entity ref path (namespace/kind/name) whose TechDocs are cited. */
    docsEntity: string;
    /**
     * @deprecated Unused. MCP calls use a token issued on behalf of the
     * signed-in user.
     * @visibility secret
     */
    mcpToken?: string;
  };
}
