export interface Config {
  copilotChat?: {
    /** Model used when the client does not request one. */
    defaultModel?: string;
    /** Entity ref path (namespace/kind/name) whose TechDocs are cited. */
    docsEntity: string;
    /**
     * Static token for the Backstage MCP actions endpoint.
     * @visibility secret
     */
    mcpToken?: string;
  };
}
