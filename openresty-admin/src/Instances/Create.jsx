import React from 'react';
import { Create as RaCreate } from 'react-admin';
import Form from './Form'

const Create = () => {
  return (
    <RaCreate title={"Instances"} redirect="list">
        <Form isEdit={false} />
    </RaCreate>
  )
}

export default Create