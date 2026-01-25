import React from 'react';
import { Box, Typography, Card, CardHeader, useTheme, alpha, IconButton, Tooltip } from "@mui/material";
import RefreshIcon from '@mui/icons-material/RefreshRounded';
import FullscreenIcon from '@mui/icons-material/FullscreenRounded';
import { useThemeMode } from '../Theme';

const Logs = ({ data, heading, onRefresh }) => {
    const theme = useTheme();
    const { mode } = useThemeMode();
    const isDark = mode === 'dark';
    
    // Convert data to string if it's an array or object
    const logText = typeof data === 'string' 
        ? data 
        : Array.isArray(data) 
            ? data.join('\n') 
            : JSON.stringify(data, null, 2);
    
    return (
        <Card
            sx={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 3,
            }}
        >
            <CardHeader
                title={
                    <Typography
                        variant="subtitle1"
                        sx={{
                            fontWeight: 600,
                            color: theme.palette.text.primary,
                            display: 'flex',
                            alignItems: 'center',
                            gap: 1,
                        }}
                    >
                        <Box
                            component="span"
                            sx={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                backgroundColor: heading?.toLowerCase().includes('error') 
                                    ? theme.palette.error.main 
                                    : theme.palette.success.main,
                                animation: 'pulse 2s infinite',
                                '@keyframes pulse': {
                                    '0%': { opacity: 1 },
                                    '50%': { opacity: 0.5 },
                                    '100%': { opacity: 1 },
                                },
                            }}
                        />
                        {heading}
                    </Typography>
                }
                action={
                    <Box sx={{ display: 'flex', gap: 0.5 }}>
                        {onRefresh && (
                            <Tooltip title="Refresh logs">
                                <IconButton 
                                    size="small" 
                                    onClick={onRefresh}
                                    sx={{ 
                                        color: theme.palette.text.secondary,
                                        '&:hover': {
                                            backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                        },
                                    }}
                                >
                                    <RefreshIcon fontSize="small" />
                                </IconButton>
                            </Tooltip>
                        )}
                        <Tooltip title="Fullscreen">
                            <IconButton 
                                size="small"
                                sx={{ 
                                    color: theme.palette.text.secondary,
                                    '&:hover': {
                                        backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                    },
                                }}
                            >
                                <FullscreenIcon fontSize="small" />
                            </IconButton>
                        </Tooltip>
                    </Box>
                }
                sx={{
                    borderBottom: `1px solid ${theme.palette.divider}`,
                    py: 1.5,
                    px: 2,
                    backgroundColor: isDark 
                        ? alpha(theme.palette.background.paper, 0.5)
                        : theme.palette.grey[50],
                }}
            />
            <Box
                sx={{
                    flex: 1,
                    minHeight: 300,
                    maxHeight: 400,
                    overflow: 'auto',
                    backgroundColor: isDark ? '#0a0a0f' : '#1a1a2e',
                    fontFamily: '"JetBrains Mono", "Fira Code", "Consolas", monospace',
                    fontSize: '0.8125rem',
                    lineHeight: 1.6,
                    p: 2,
                    color: isDark ? '#a5f3a5' : '#98fb98',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    '&::-webkit-scrollbar': {
                        width: 8,
                    },
                    '&::-webkit-scrollbar-thumb': {
                        backgroundColor: alpha('#fff', 0.2),
                        borderRadius: 4,
                    },
                    '&::-webkit-scrollbar-track': {
                        backgroundColor: 'transparent',
                    },
                }}
            >
                {logText || (
                    <Typography 
                        sx={{ 
                            color: alpha('#fff', 0.4),
                            fontStyle: 'italic',
                        }}
                    >
                        No logs available
                    </Typography>
                )}
            </Box>
        </Card>
    );
};

export default Logs;