import { Menu as RaMenu, useStore } from 'react-admin';
import UserIcon from "@mui/icons-material/Group";
import SessionIcon from "@mui/icons-material/HistoryToggleOff";
import ServerIcon from "@mui/icons-material/Storage";
import RuleIcon from "@mui/icons-material/Rule";
import ProfileIcon from '@mui/icons-material/RecentActors';
import SecretIcon from '@mui/icons-material/Key';

export const Menu = () => {
    const [settings] = useStore('app.settings', {});
    
    return (
        <RaMenu>
            <RaMenu.DashboardItem />
            <RaMenu.Item to="/users" primaryText="Users" leftIcon={<UserIcon />}/>
            {settings.storage_type === "redis" && (
                <RaMenu.Item to="/sessions" primaryText="Sessions" leftIcon={<SessionIcon />}/>
            )}
            <RaMenu.Item to="/servers" primaryText="Servers" leftIcon={<ServerIcon />}/>
            <RaMenu.Item to="/rules" primaryText="Rules" leftIcon={<RuleIcon />}/>
            {/* <RaMenu.Item to="/settings" primaryText="Settings" leftIcon={<SettingsIcon/>}/> */}
            <RaMenu.Item to="/profiles" className='profiles-menu' primaryText="Profile" leftIcon={<ProfileIcon />}/>
            <RaMenu.Item to="/secrets" className='secrets-menu' primaryText="Secrets" leftIcon={<SecretIcon />}/>
        </RaMenu>
    )
};