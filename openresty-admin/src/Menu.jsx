import { Menu as RaMenu, useStore, useSidebarState } from "react-admin";
import { Box, Typography, Divider, useTheme, alpha } from "@mui/material";
import DashboardIcon from "@mui/icons-material/DashboardRounded";
import UserIcon from "@mui/icons-material/GroupRounded";
import SessionIcon from "@mui/icons-material/HistoryToggleOffRounded";
import ServerIcon from "@mui/icons-material/DnsRounded";
import RuleIcon from "@mui/icons-material/RuleRounded";
import ProfileIcon from "@mui/icons-material/RecentActorsRounded";
import SecretIcon from "@mui/icons-material/KeyRounded";
import InstanceIcon from "@mui/icons-material/ViewInArRounded";
import WafRuleIcon from "@mui/icons-material/ShieldRounded";
import WafPolicyIcon from "@mui/icons-material/VerifiedUserRounded";
import WafEventIcon from "@mui/icons-material/NotificationsActiveRounded";
import IngressIcon from "@mui/icons-material/AccountTree";
import HealthIcon from "@mui/icons-material/MonitorHeartRounded";
import BookmarkIcon from "@mui/icons-material/BookmarkRounded";
import Logo from "./component/Logo";
import { useThemeMode } from "./Theme";

// Custom styled menu item component
const StyledMenuItem = ({ to, primaryText, leftIcon, ...props }) => {
  const theme = useTheme();

  return (
    <RaMenu.Item
      to={to}
      primaryText={primaryText}
      leftIcon={leftIcon}
      sx={{
        borderRadius: 2,
        mx: 1,
        my: 0.5,
        transition: "all 0.2s ease",
        "&:hover": {
          backgroundColor: alpha(theme.palette.primary.main, 0.08),
          transform: "translateX(4px)",
        },
        "&.RaMenuItemLink-active": {
          backgroundColor: alpha(theme.palette.primary.main, 0.12),
          color: theme.palette.primary.main,
          fontWeight: 600,
          "& .MuiSvgIcon-root": {
            color: theme.palette.primary.main,
          },
          "&::before": {
            content: '""',
            position: "absolute",
            left: 0,
            top: "50%",
            transform: "translateY(-50%)",
            width: 4,
            height: "60%",
            backgroundColor: theme.palette.primary.main,
            borderRadius: "0 4px 4px 0",
          },
        },
        "& .MuiSvgIcon-root": {
          fontSize: "1.25rem",
          color: theme.palette.text.secondary,
          transition: "color 0.2s ease",
        },
        "& .MuiTypography-root": {
          fontSize: "0.875rem",
          fontWeight: 500,
        },
      }}
      {...props}
    />
  );
};

export const Menu = () => {
  const [settings] = useStore("app.settings", {});
  const [open] = useSidebarState();
  const theme = useTheme();
  const { mode } = useThemeMode();

  return (
    <RaMenu
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        pt: 2,
        pb: 2,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      {/* Logo for collapsed sidebar */}
      {!open && (
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            mb: 2,
            px: 1,
          }}
        >
          <Logo variant="icon" height={36} theme={mode} />
        </Box>
      )}

      {/* Main Navigation Section */}
      <Box sx={{ px: 1 }}>
        {open && (
          <Typography
            variant="overline"
            sx={{
              px: 2,
              py: 1,
              color: theme.palette.text.secondary,
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              display: "block",
            }}
          >
            Navigation
          </Typography>
        )}

        <StyledMenuItem
          to="/"
          primaryText="Dashboard"
          leftIcon={<DashboardIcon />}
        />
        <StyledMenuItem
          to="/users"
          primaryText="Users"
          leftIcon={<UserIcon />}
        />
        {settings.storage_type === "redis" && (
          <StyledMenuItem
            to="/sessions"
            primaryText="Sessions"
            leftIcon={<SessionIcon />}
          />
        )}
        <StyledMenuItem
          to="/health"
          primaryText="System Health"
          leftIcon={<HealthIcon />}
        />
        <StyledMenuItem
          to="/bookmarks"
          primaryText="Bookmarks"
          leftIcon={<BookmarkIcon />}
        />
      </Box>

      <Divider sx={{ my: 2, mx: 2, borderColor: theme.palette.divider }} />

      {/* Configuration Section */}
      <Box sx={{ px: 1 }}>
        {open && (
          <Typography
            variant="overline"
            sx={{
              px: 2,
              py: 1,
              color: theme.palette.text.secondary,
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              display: "block",
            }}
          >
            Configuration
          </Typography>
        )}

        <StyledMenuItem
          to="/servers"
          primaryText="Virtual Servers"
          leftIcon={<ServerIcon />}
        />
        <StyledMenuItem
          to="/rules"
          primaryText="Server Rules"
          leftIcon={<RuleIcon />}
        />
        <StyledMenuItem
          to="/profiles"
          primaryText="Profiles"
          leftIcon={<ProfileIcon />}
        />
        <StyledMenuItem
          to="/secrets"
          primaryText="Secrets"
          leftIcon={<SecretIcon />}
        />
        <StyledMenuItem
          to="/instances"
          primaryText="Instances"
          leftIcon={<InstanceIcon />}
        />
        {import.meta.env.VITE_TARGET_PLATFORM === 'KUBERNETES' && (
          <StyledMenuItem
            to="/ingress"
            primaryText="Ingress Overview"
            leftIcon={<IngressIcon />}
          />
        )}
      </Box>

      <Divider sx={{ my: 2, mx: 2, borderColor: theme.palette.divider }} />

      {/* Security Section */}
      <Box sx={{ px: 1, flex: 1 }}>
        {open && (
          <Typography
            variant="overline"
            sx={{
              px: 2,
              py: 1,
              color: theme.palette.text.secondary,
              fontSize: "0.65rem",
              fontWeight: 700,
              letterSpacing: "0.1em",
              display: "block",
            }}
          >
            Security
          </Typography>
        )}

        <StyledMenuItem
          to="/waf_rules"
          primaryText="WAF Rules"
          leftIcon={<WafRuleIcon />}
        />
        <StyledMenuItem
          to="/waf_policies"
          primaryText="WAF Policies"
          leftIcon={<WafPolicyIcon />}
        />
        <StyledMenuItem
          to="/waf_events"
          primaryText="WAF Events"
          leftIcon={<WafEventIcon />}
        />
      </Box>

      {/* Footer */}
      {open && (
        <Box
          sx={{
            px: 2,
            py: 2,
            mt: "auto",
            borderTop: `1px solid ${theme.palette.divider}`,
          }}
        >
          <Typography
            variant="caption"
            sx={{
              color: theme.palette.text.disabled,
              display: "block",
              textAlign: "center",
            }}
          >
            WSL Proxy Admin v1.0
          </Typography>
        </Box>
      )}
    </RaMenu>
  );
};
