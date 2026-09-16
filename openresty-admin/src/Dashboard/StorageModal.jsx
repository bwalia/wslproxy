import * as React from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Slide from "@mui/material/Slide";
import TextField from "@mui/material/TextField";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Stack from "@mui/material/Stack";
import { useDataProvider, useStore, useTranslate } from "react-admin";

const Transition = React.forwardRef(function Transition(props, ref) {
  return <Slide direction="up" ref={ref} {...props} />;
});

const emptyPgsql = () => ({
  pg_host: "",
  pg_port: "5432",
  pg_database: "wslproxy",
  pg_user: "wslproxy",
  pg_password: "",
});

const StorageModal = ({ isOpen }) => {
  const dataProvider = useDataProvider();
  const [storageMgmt, setStorageMgmt] = useStore(
    "storageManagement.type",
    "redis",
  );
  const [sModalOpen, setSModalOpen] = useStore("storage.modal", false);
  const [open, setOpen] = React.useState(isOpen);
  const [pending, setPending] = React.useState(storageMgmt || "redis");
  const [pgsql, setPgsql] = React.useState(emptyPgsql);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");
  const translate = useTranslate();

  React.useEffect(() => {
    const stored = localStorage.getItem("storageManagement");
    if (stored) {
      setStorageMgmt(stored);
      setPending(stored);
    }
  }, [setStorageMgmt]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    dataProvider
      .loadSettings?.("global/settings", {})
      .then((res) => {
        if (cancelled) return;
        const settings = res?.data || res || {};
        const raw = settings.pgsql || {};
        setPgsql({
          pg_host: String(raw.pg_host ?? raw.host ?? ""),
          pg_port: String(raw.pg_port ?? raw.port ?? "5432"),
          pg_database: String(raw.pg_database ?? raw.database ?? "wslproxy"),
          pg_user: String(raw.pg_user ?? raw.user ?? "wslproxy"),
          pg_password: "",
        });
        if (settings.storage_type) {
          setPending(settings.storage_type);
          setStorageMgmt(settings.storage_type);
        }
      })
      .catch(() => {
        /* settings optional — user can still fill fields */
      });
    return () => {
      cancelled = true;
    };
  }, [open, dataProvider, setStorageMgmt]);

  const setStorage = (storageType, extra = {}) => {
    setSaving(true);
    setError("");
    return dataProvider
      .saveStorageFlag("storage/management", {
        storage: storageType,
        ...extra,
      })
      .then(({ data }) => {
        const { storage } = data;
        setOpen(false);
        setSModalOpen(false);
        localStorage.setItem("storageManagement", storage);
        setStorageMgmt(storage);
        window.location.reload();
      })
      .catch((err) => {
        console.log(err);
        setError(
          err?.message ||
            err?.body?.error ||
            String(err) ||
            "Failed to switch storage",
        );
      })
      .finally(() => setSaving(false));
  };

  const handleRedis = () => {
    setPending("redis");
    setStorage("redis");
  };
  const handleDisk = () => {
    setPending("disk");
    setStorage("disk");
  };
  const handlePgsqlSelect = () => {
    setPending("pgsql");
    setError("");
  };
  const handlePgsqlApply = () => {
    if (!pgsql.pg_host.trim() || !pgsql.pg_database.trim() || !pgsql.pg_user.trim()) {
      setError(
        translate("brahmstra.dashboard.storage.pgsql_required") ||
          "Host, database, and user are required for PostgreSQL.",
      );
      return;
    }
    setStorage("pgsql", {
      pgsql: {
        pg_host: pgsql.pg_host.trim(),
        pg_port: Number(pgsql.pg_port) || 5432,
        pg_database: pgsql.pg_database.trim(),
        pg_user: pgsql.pg_user.trim(),
        pg_password: pgsql.pg_password,
      },
    });
  };

  const handleClose = () => {
    setOpen(false);
    setSModalOpen(false);
  };

  const updatePgsql = (field) => (e) =>
    setPgsql((prev) => ({ ...prev, [field]: e.target.value }));

  return (
    <div>
      <Dialog
        open={open}
        TransitionComponent={Transition}
        keepMounted
        onClose={handleClose}
        aria-describedby="alert-dialog-slide-description"
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>
          {translate("brahmstra.dashboard.storage.title")}
        </DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-slide-description">
            {translate("brahmstra.dashboard.storage.subtitle")}
          </DialogContentText>
          {error && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {error}
            </Alert>
          )}
          {pending === "pgsql" && (
            <Box sx={{ mt: 2 }}>
              <DialogContentText sx={{ mb: 1.5 }}>
                {translate("brahmstra.dashboard.storage.pgsql_hint")}
              </DialogContentText>
              <Stack spacing={1.5}>
                <TextField
                  label={translate("brahmstra.dashboard.storage.pg_host")}
                  value={pgsql.pg_host}
                  onChange={updatePgsql("pg_host")}
                  size="small"
                  fullWidth
                  required
                  autoComplete="off"
                />
                <TextField
                  label={translate("brahmstra.dashboard.storage.pg_port")}
                  value={pgsql.pg_port}
                  onChange={updatePgsql("pg_port")}
                  size="small"
                  fullWidth
                  inputMode="numeric"
                />
                <TextField
                  label={translate("brahmstra.dashboard.storage.pg_database")}
                  value={pgsql.pg_database}
                  onChange={updatePgsql("pg_database")}
                  size="small"
                  fullWidth
                  required
                />
                <TextField
                  label={translate("brahmstra.dashboard.storage.pg_user")}
                  value={pgsql.pg_user}
                  onChange={updatePgsql("pg_user")}
                  size="small"
                  fullWidth
                  required
                  autoComplete="off"
                />
                <TextField
                  label={translate("brahmstra.dashboard.storage.pg_password")}
                  type="password"
                  value={pgsql.pg_password}
                  onChange={updatePgsql("pg_password")}
                  size="small"
                  fullWidth
                  autoComplete="new-password"
                  helperText={translate(
                    "brahmstra.dashboard.storage.pg_password_hint",
                  )}
                />
              </Stack>
            </Box>
          )}
        </DialogContent>
        <DialogActions sx={{ flexWrap: "wrap", gap: 1, px: 2, pb: 2 }}>
          <Button
            variant={pending === "redis" ? "contained" : "outlined"}
            onClick={handleRedis}
            disabled={saving}
          >
            {translate("brahmstra.dashboard.storage.redis")}
          </Button>
          <Button
            variant={pending === "disk" ? "contained" : "outlined"}
            onClick={handleDisk}
            disabled={saving}
          >
            {translate("brahmstra.dashboard.storage.disk")}
          </Button>
          <Button
            variant={pending === "pgsql" ? "contained" : "outlined"}
            onClick={handlePgsqlSelect}
            disabled={saving}
          >
            {translate("brahmstra.dashboard.storage.pgsql")}
          </Button>
          {pending === "pgsql" && (
            <Button
              variant="contained"
              color="primary"
              onClick={handlePgsqlApply}
              disabled={saving}
              sx={{ ml: "auto" }}
            >
              {translate("brahmstra.dashboard.storage.apply_pgsql")}
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default StorageModal;
