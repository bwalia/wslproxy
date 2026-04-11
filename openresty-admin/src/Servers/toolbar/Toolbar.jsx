import React from "react";
import {
  Toolbar as RaToolbar,
  SaveButton,
  useDataProvider,
  useRedirect,
  useNotify,
} from "react-admin";
import { useFormContext } from "react-hook-form";

const Toolbar = () => {
  const formContext = useFormContext()
  const { getValues } = useFormContext();
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const notify = useNotify();
  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    const { id, ...data } = getValues();
    if (!data.server_name) {
      notify("Server name is required", { type: "error" });
      return;
    }
    if (!data.profile_id) {
      notify("Profile is required", { type: "error" });
      return;
    }
    // Access-Control-Allow-Origin guardrail — bare hostnames are silently
    // ignored by browsers and are a common misconfiguration.
    const corsBad = (data.custom_response_headers || []).find((h) => {
      if (!h || !h.header_key || !h.header_value) return false;
      if (h.header_key.toLowerCase() !== "access-control-allow-origin") return false;
      const v = h.header_value.trim();
      if (v === "*" || v === "null") return false;
      return !/^https?:\/\/[\w\-.:]+(\/.*)?$/.test(v);
    });
    if (corsBad) {
      notify(
        `Access-Control-Allow-Origin must be '*', 'null', or a scheme-qualified origin (e.g. https://example.com). Got: ${corsBad.header_value}`,
        { type: "error", autoHideDuration: 10000 },
      );
      return;
    }
    try {
      const serverData = id
        ? await dataProvider.update("servers", { id, data: { ...data, id } })
        : await dataProvider.create("servers", { data });
      if (serverData?.data?.nginx_status) {
        notify(serverData.data.nginx_status, {
          autoHideDuration: 30000,
          type: serverData.data.nginx_status_check,
        });
      }
      redirect("/servers");
    } catch (error) {
      const message =
        typeof error === "string"
          ? error
          : error?.message || "Failed to save server";
      notify(message, { autoHideDuration: 30000, type: "error" });
    }
  };
  return (
    <RaToolbar>
      <SaveButton label="Save" onClick={handleRuleSubmit} />
    </RaToolbar>
  );
};

export default Toolbar;
