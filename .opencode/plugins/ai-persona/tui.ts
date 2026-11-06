type IdleEvent = { data: { sessionID: string } };

interface TuiContext {
  data: {
    on(type: "session.idle", handler: (event: IdleEvent) => void): () => void;
  };
  ui: {
    toast: { show(input: { title: string; message: string; variant: "success" }): void };
  };
  attention: {
    notify(input: {
      title: string;
      message: string;
      notification: { when: "blurred" };
    }): Promise<unknown>;
  };
}

export default {
  id: "ai-persona.tui",
  setup(context: TuiContext) {
    return context.data.on("session.idle", (event) => {
      const message = `Agent finished (${event.data.sessionID.slice(0, 8)}).`;
      context.ui.toast.show({ title: "ai-persona", message, variant: "success" });
      void context.attention.notify({
        title: "OpenCode",
        message,
        notification: { when: "blurred" },
      });
    });
  },
};
