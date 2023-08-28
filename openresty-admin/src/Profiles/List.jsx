import React from 'react';
import { List as RaList, SimpleList } from 'react-admin';

const List = () => {
  return (
    <RaList>
      <SimpleList
        primaryText={record => record.title}
        secondaryText={record => `${record.views} views`}
        tertiaryText={record => new Date(record.published_at).toLocaleDateString()}
        linkType={record => record.canEdit ? "edit" : "show"}
        rowSx={record => ({ backgroundColor: record.nb_views >= 500 ? '#efe' : 'white' })}
      />
    </RaList>
  )
}

export default List