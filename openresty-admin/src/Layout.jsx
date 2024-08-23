import React from "react";
import { Layout, useDataProvider, useStore } from "react-admin";
import AppBar from "./AppBar";
import { Menu } from "./Menu";
export const MyLayout = (props) => {
    const dataProvider = useDataProvider();
    const [settings, setSettings] = useStore('app.settings', {})
    React.useEffect(() => {
      const globalSettings = dataProvider.loadSettings("global/settings", {});
      globalSettings.then(settings => {
        setSettings(settings.data);
      })
    }, [])
    return (<Layout {...props} appBar={AppBar} menu={Menu} />)
}