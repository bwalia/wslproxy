import React from 'react';
import { List as RaList, SimpleList } from 'react-admin';

const List = () => {
  return (
    <RaList>
      <SimpleList
        primaryText={record => record.name}
        tertiaryText={record => new Date(record.createdAt).toLocaleDateString()}
        linkType="edit"
        rowSx={record => ({ backgroundColor: record.nb_views >= 500 ? '#efe' : 'white' })}
      />
    </RaList>
  )
}

export default List