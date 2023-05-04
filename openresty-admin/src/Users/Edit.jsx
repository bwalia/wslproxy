import React from 'react';
import { Edit as RaEdit } from 'react-admin';
import Form from './Form';

const Edit = () => {
  return (
    <RaEdit title={"User"}>
        <Form />
    </RaEdit>
  )
}

export default Edit