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
