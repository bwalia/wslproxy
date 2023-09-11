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

    // if (!formContext.formState.isValid) {
    //   notify(`Something went wrong! Please check all required fields`, { type: 'error' });
    //   return false;
    // }
    const encodeData = encodeURIComponent(data.match.response.message);
    data.match.response.message = encodeData;

    if (id) {
      data.id = id
      await dataProvider.update("rules", { id, data });
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
