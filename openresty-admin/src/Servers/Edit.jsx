import React from 'react';
import { Edit as RaEdit } from 'react-admin';
import Form from './Form';

const Edit = () => {
  return (
    <RaEdit title={"Virtual Server"} redirect="list">
        <Form type="edit" />
    </RaEdit>
  )
}

export default Edit