import React from "react";
import {
  Toolbar as RaToolbar,
  SaveButton,
  useDataProvider,
  useRedirect,
} from "react-admin";
import { useFormContext } from "react-hook-form";
import {Base64} from 'js-base64';

const Toolbar = () => {
  const { getValues } = useFormContext();
  const dataProvider = useDataProvider();
  const redirect = useRedirect();
  const utf8ToBase64 = (str) => {
    const latin = Base64.encode(str, true)
    return latin
  };

  const handleRuleSubmit = async (e) => {
    e.preventDefault();
    const { id, ...data } = getValues();
    const encodeData = utf8ToBase64(data.match.response.message);
    data.match.response.message = encodeData;

    if (id) {
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
