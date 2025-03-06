import * as React from "react";
import Button from "@mui/material/Button";
import CssBaseline from "@mui/material/CssBaseline";
import TextField from "@mui/material/TextField";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Container from "@mui/material/Container";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { useState } from "react";
import { useDataProvider, useNotify, Notification } from "react-admin";

const ResetForm = () => {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const dataProvider = useDataProvider();
  const notify = useNotify();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return notify("New Passwords and Confirm Password should be same.", { type: 'error' });
    }
    dataProvider.resetPassword("password/reset", {oldPassword, newPassword, confirmPassword}).then((response) => {
      if (response?.error) {
        return notify(response.error, { type: 'error' });
      }
      if (response?.message) {
        return notify(response.message, { type: 'success' });
      }
    });
  };
  const theme = createTheme();

  const secondaryColor = import.meta.env.VITE_THEME_SECONDARY_COLOR
  const hoverColor = import.meta.env.VITE_THEME_HOVER_COLOR

  return (
    <ThemeProvider theme={theme} className="login-wrapper">
      <Container component="main" maxWidth="xs" className="login-container">
        <CssBaseline />
        <Box
          sx={{
            marginTop: 8,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <Typography component="h1" variant="h5">Change your Password</Typography>
          <Box
            component="form"
            onSubmit={handleSubmit}
            noValidate
            sx={{ mt: 1 }}
          >
            <TextField
              margin="normal"
              required
              fullWidth
              id="oldPassword"
              label="Old Password"
              name="oldPassword"
              autoFocus
              autoComplete="off"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="newPassword"
              label="New Password"
              type="password"
              autoComplete="off"
              id="newPassword"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <TextField
              margin="normal"
              required
              fullWidth
              name="confirmPassword"
              label="Confirm Password"
              type="password"
              autoComplete="off"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2, bgcolor: `#${secondaryColor}`, ":hover": { bgcolor: `#${hoverColor}` } }}
              onClick={handleSubmit}
            >
              Reset Password
            </Button>
          </Box>
        </Box>
      </Container>
    </ThemeProvider>
  );
};

export default ResetForm;