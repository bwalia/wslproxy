import React from "react";
import {
  Toolbar as RaToolbar,
  SaveButton,
  useDataProvider,
  useRedirect,
} from "react-admin";
import { useFormContext } from "react-hook-form";

const Toolbar = () => {
  const { getValues } = useFormContext();
  const dataProvider = useDataProvider();
  const redirect = useRedirect();

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    const { id, ...data } = getValues();
    const encodeData = encodeURIComponent(data.match.response.message);
    data.match.response.message = encodeData;

    if (id) {
      console.log("data: ", data)
      await dataProvider.update("rules", { data });
    } else {
      await dataProvider.create("rules", { data });
    }
    redirect("/rules");
  };
  return (
    <RaToolbar>
      <SaveButton label="Save" onClick={handleRuleSubmit} />
    </RaToolbar>
  );
};

export default Toolbar;
