import React from "react";
import { Show as RaShow, SimpleShowLayout, ImageField } from "react-admin";

const Show = () => {
  return (
    <RaShow>
      <SimpleShowLayout>
        <ImageField source="site_logo.blob" title="title" />
      </SimpleShowLayout>
    </RaShow>
  );
};

export default Show;
