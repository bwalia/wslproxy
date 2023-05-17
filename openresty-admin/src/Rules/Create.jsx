import React from 'react';
import { Create as RaCreate } from 'react-admin';
import Form from './Form'

const Create = () => {
  return (
    <RaCreate title={"Rule"}>
        <Form />
    </RaCreate>
  )
}

export default Create