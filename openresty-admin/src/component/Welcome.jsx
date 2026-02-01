import * as React from 'react';
import { Box, Card, CardActions, Button, Typography, useTheme, alpha, Chip } from '@mui/material';
import ServerIcon from "@mui/icons-material/DnsRounded";
import RuleIcon from "@mui/icons-material/RuleRounded";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { useTranslate } from 'react-admin';
import Logo from './Logo';
import { useThemeMode } from '../Theme';

const Welcome = ({ instanceInfo = {} }) => {
    const translate = useTranslate();
    const theme = useTheme();
    const { mode } = useThemeMode();
    const isDark = mode === 'dark';
    
    return (
        <Card
            sx={{
                position: 'relative',
                overflow: 'hidden',
                width: '100%',
                boxSizing: 'border-box',
                borderRadius: 3,
                background: isDark
                    ? `linear-gradient(135deg, ${alpha('#6366f1', 0.15)} 0%, ${alpha('#8b5cf6', 0.1)} 50%, ${alpha('#10b981', 0.1)} 100%)`
                    : `linear-gradient(135deg, ${alpha('#6366f1', 0.08)} 0%, ${alpha('#8b5cf6', 0.05)} 50%, ${alpha('#10b981', 0.05)} 100%)`,
                border: `1px solid ${isDark ? alpha('#6366f1', 0.2) : alpha('#6366f1', 0.15)}`,
                padding: 0,
                marginTop: 0,
                marginBottom: 0,
            }}
        >
            {/* Decorative elements */}
            <Box
                sx={{
                    position: 'absolute',
                    top: -50,
                    right: -50,
                    width: 200,
                    height: 200,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${alpha('#6366f1', 0.1)} 0%, transparent 70%)`,
                }}
            />
            <Box
                sx={{
                    position: 'absolute',
                    bottom: -30,
                    left: '30%',
                    width: 150,
                    height: 150,
                    borderRadius: '50%',
                    background: `radial-gradient(circle, ${alpha('#10b981', 0.1)} 0%, transparent 70%)`,
                }}
            />
            
            <Box display="flex" sx={{ p: 4, position: 'relative', zIndex: 1 }}>
                <Box flex="1">
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 2 }}>
                        <Chip
                            label="Admin Portal"
                            size="small"
                            sx={{
                                backgroundColor: alpha(theme.palette.primary.main, 0.1),
                                color: theme.palette.primary.main,
                                fontWeight: 600,
                                fontSize: '0.7rem',
                            }}
                        />
                    </Box>
                    
                    <Typography 
                        variant="h4" 
                        component="h2" 
                        gutterBottom
                        sx={{
                            fontWeight: 700,
                            color: theme.palette.text.primary,
                            letterSpacing: '-0.02em',
                        }}
                    >
                        {translate('brahmstra.dashboard.welcome.title', { _: 'Welcome to WSL Proxy' })}
                    </Typography>
                    
                    <Box maxWidth="36em">
                        <Typography 
                            variant="body1" 
                            component="p" 
                            gutterBottom
                            sx={{
                                color: theme.palette.text.secondary,
                                lineHeight: 1.7,
                                mb: 3,
                            }}
                        >
                            {translate('brahmstra.dashboard.welcome.subtitle', { 
                                _: 'Manage your reverse proxy configurations, routing rules, and server instances from this centralized control panel.'
                            })}
                        </Typography>
                    </Box>
                    
                    <CardActions sx={{ padding: 0, gap: 2 }}>
                        <Button
                            variant="contained"
                            href="/#/servers"
                            startIcon={<ServerIcon />}
                            endIcon={<ArrowForwardIcon sx={{ fontSize: '1rem !important' }} />}
                            sx={{
                                backgroundColor: theme.palette.primary.main,
                                color: '#fff',
                                px: 3,
                                py: 1.25,
                                fontWeight: 600,
                                boxShadow: `0 4px 14px ${alpha(theme.palette.primary.main, 0.4)}`,
                                '&:hover': {
                                    backgroundColor: theme.palette.primary.dark,
                                    transform: 'translateY(-2px)',
                                    boxShadow: `0 6px 20px ${alpha(theme.palette.primary.main, 0.5)}`,
                                },
                                transition: 'all 0.2s ease',
                            }}
                        >
                            {translate('brahmstra.dashboard.welcome.server_button', { _: 'Manage Servers' })}
                        </Button>
                        <Button
                            variant="outlined"
                            href="/#/rules"
                            startIcon={<RuleIcon />}
                            sx={{
                                borderColor: theme.palette.primary.main,
                                color: theme.palette.primary.main,
                                px: 3,
                                py: 1.25,
                                fontWeight: 600,
                                '&:hover': {
                                    backgroundColor: alpha(theme.palette.primary.main, 0.08),
                                    borderColor: theme.palette.primary.dark,
                                },
                            }}
                        >
                            {translate('brahmstra.dashboard.welcome.rule_button', { _: 'Configure Rules' })}
                        </Button>
                    </CardActions>
                </Box>
                
                {/* Right side instance info */}
                <Box
                    display={{ xs: 'none', md: 'flex' }}
                    flexDirection="column"
                    sx={{
                        ml: 4,
                        minWidth: '280px',
                        gap: 1.5,
                    }}
                >
                    <Typography
                        variant="overline"
                        sx={{
                            color: theme.palette.text.secondary,
                            fontWeight: 600,
                            fontSize: '0.7rem',
                            letterSpacing: '0.1em',
                        }}
                    >
                        Instance Info
                    </Typography>

                    <Box sx={{
                        backgroundColor: isDark ? alpha('#0f172a', 0.6) : alpha('#fff', 0.7),
                        borderRadius: 2,
                        p: 2,
                        border: `1px solid ${isDark ? alpha('#334155', 0.5) : alpha('#cbd5e1', 0.5)}`,
                    }}>
                        <Box sx={{ mb: 1.5 }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}>
                                Hostname
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>
                                {instanceInfo.hostname || 'Loading...'}
                            </Typography>
                        </Box>

                        <Box sx={{ mb: 1.5 }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}>
                                IP Address
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>
                                {instanceInfo.ip_addresses && instanceInfo.ip_addresses.length > 0
                                    ? instanceInfo.ip_addresses[0]
                                    : 'Loading...'}
                            </Typography>
                        </Box>

                        <Box sx={{ mb: 1.5 }}>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}>
                                OS
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                                {instanceInfo.os || 'Loading...'}
                            </Typography>
                        </Box>

                        <Box>
                            <Typography variant="caption" sx={{ color: theme.palette.text.secondary, fontSize: '0.7rem' }}>
                                CPU
                            </Typography>
                            <Typography variant="body2" sx={{ fontWeight: 500, fontSize: '0.75rem' }}>
                                {instanceInfo.cpu?.cores || '?'} cores
                            </Typography>
                        </Box>
                    </Box>

                    <Button
                        variant="text"
                        href="/#/instances"
                        size="small"
                        sx={{
                            fontSize: '0.7rem',
                            fontWeight: 600,
                            color: theme.palette.primary.main,
                            textAlign: 'right',
                            justifyContent: 'flex-end',
                            '&:hover': {
                                backgroundColor: alpha(theme.palette.primary.main, 0.08),
                            },
                        }}
                    >
                        View Details →
                    </Button>
                </Box>
            </Box>
        </Card>
    );
};

export default Welcome;