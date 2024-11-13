import React from 'react';
import {
    TopToolbar,
    FilterButton,
    CreateButton,
    ExportButton,
    Button,
    List
} from 'react-admin';
import ImportJsonButton from './ImportJsonButton';

const ToolBar = ({ resource }) => {
    return (
        <TopToolbar>
            <FilterButton />
            <CreateButton />
            <ExportButton />
            <ImportJsonButton resource={resource} />
        </TopToolbar>
    )
}

export default ToolBar