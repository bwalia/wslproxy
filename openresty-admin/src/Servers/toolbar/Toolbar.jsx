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
    let serverData = {}
    if (id) {
      data.id = id
      serverData = dataProvider.update("servers", { id, data });
    } else {
      serverData = dataProvider.create("servers", { data });
    }
    serverData.then(server => {
      server?.data?.nginx_status && notify(server?.data?.nginx_status, {autoHideDuration: 30000, type: server?.data?.nginx_status_check})
    });

    serverData.catch(error => {
      notify(error, {autoHideDuration: 30000, type: "error"})
    })

    redirect("/servers");
  };
  return (
    <RaToolbar>
      <SaveButton label="Save" onClick={handleRuleSubmit} />
    </RaToolbar>
  );
};

export default Toolbar;
