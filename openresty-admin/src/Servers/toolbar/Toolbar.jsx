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
    if (id) {
      data.id = id
      const serverData = await dataProvider.update("servers", { id, data });
      serverData?.data?.nginx_status && notify(serverData?.data?.nginx_status, {autoHideDuration: 5000, type: serverData?.data?.nginx_status_check})
    } else {
      const serverData = await dataProvider.create("servers", { data });
      serverData?.data?.nginx_status && notify(serverData?.data?.nginx_status, {autoHideDuration: 5000, type: serverData?.data?.nginx_status_check})
    }
    redirect("/servers");
  };
  return (
    <RaToolbar>
      <SaveButton label="Save" onClick={handleRuleSubmit} />
    </RaToolbar>
  );
};

export default Toolbar;
