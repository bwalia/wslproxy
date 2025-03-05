import * as React from "react";
import { useRedirect } from "react-admin";
import { MenuItem, ListItemIcon, ListItemText } from "@mui/material";
import LockResetIcon from '@mui/icons-material/LockReset';

const ResetPassword = React.forwardRef((props, ref) => {
  const redirect = useRedirect();
  const handleResetPassword = () => {
    redirect("/password/reset");
  };
  return (
    <MenuItem
      onClick={handleResetPassword}
      ref={ref}
      {...props}
    >
      <ListItemIcon>
        <LockResetIcon fontSize="small" />
      </ListItemIcon>
      <ListItemText>Reset Password</ListItemText>
    </MenuItem>
  );
});

export default ResetPassword;
