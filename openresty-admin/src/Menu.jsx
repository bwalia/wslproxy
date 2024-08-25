import { Menu as RaMenu, useStore } from 'react-admin';
import UserIcon from "@mui/icons-material/Group";
import SessionIcon from "@mui/icons-material/HistoryToggleOff";
import ServerIcon from "@mui/icons-material/Storage";
import RuleIcon from "@mui/icons-material/Rule";
import ProfileIcon from '@mui/icons-material/RecentActors';
import SettingsIcon from '@mui/icons-material/Construction';

export const Menu = () => {
    const [settings] = useStore('app.settings', {});
    
    return (
        <RaMenu>
            <RaMenu.DashboardItem />
            <RaMenu.Item to="/users" className='bar-title'primaryText="Users" leftIcon={<UserIcon className='bar-icon' />}/>
            {settings.storage_type === "redis" && (
                <RaMenu.Item to="/sessions"className='bar-title' primaryText="Sessions" leftIcon={<SessionIcon className='bar-icon'/>}/>
            )}
            <RaMenu.Item to="/servers"className='bar-title' primaryText="Servers" leftIcon={<ServerIcon className='bar-icon'/>}/>
            <RaMenu.Item to="/rules"className='bar-title' primaryText="Rules" leftIcon={<RuleIcon className='bar-icon'/>}/>
            <RaMenu.Item to="/settings"className='bar-title' primaryText="Settings" leftIcon={<SettingsIcon className='bar-icon'/>}/>
            <RaMenu.Item to="/profiles" className='bar-title' primaryText="Profile" leftIcon={<ProfileIcon className='bar-icon' />}/>
        </RaMenu>
    )
};