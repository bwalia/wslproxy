import React from 'react';
import Form from './Form';
import { Create as RaCreate } from 'react-admin';
const Create = () => {
  return (
    <RaCreate title={"Server"}>
        <Form />
    </RaCreate>
  )
}

export default Create