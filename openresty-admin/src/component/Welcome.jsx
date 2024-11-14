import * as React from 'react';
import { Box, Card, CardActions, Button, Typography } from '@mui/material';
import ServerIcon from "@mui/icons-material/Storage";
import RuleIcon from "@mui/icons-material/Rule";
import { useTranslate } from 'react-admin';

import publishArticleImage from '/images/welcome-side.svg';

const Welcome = () => {
    const translate = useTranslate();
    return (
        <Card
            sx={{
                background: theme =>
                    `linear-gradient(45deg, ${theme.palette.secondary.dark} 0%, ${theme.palette.secondary.light} 50%, ${theme.palette.primary.dark} 100%)`,
                color: theme => theme.palette.primary.contrastText,
                padding: '20px',
                marginTop: 2,
                marginBottom: '1em',
            }}
        >
            <Box display="flex">
                <Box flex="1">
                    <Typography variant="h5" component="h2" gutterBottom>
                        {translate('brahmstra.dashboard.welcome.title')}
                    </Typography>
                    <Box maxWidth="40em">
                        <Typography variant="body1" component="p" gutterBottom>
                            {translate('brahmstra.dashboard.welcome.subtitle')}
                        </Typography>
                    </Box>
                    <CardActions
                        sx={{
                            padding: { xs: 0, xl: null },
                            flexWrap: { xs: 'wrap', xl: null },
                            '& a': {
                                marginTop: { xs: '1em', xl: null },
                                marginLeft: { xs: '0!important', xl: null },
                                marginRight: { xs: '1em', xl: null },
                            },
                        }}
                    >
                        <Button
                            variant="contained"
                            href="/#/servers"
                            startIcon={<ServerIcon />}
                        >
                            {translate('brahmstra.dashboard.welcome.server_button')}
                        </Button>
                        <Button
                            variant="contained"
                            href="/#/rules"
                            startIcon={<RuleIcon />}
                        >
                            {translate('brahmstra.dashboard.welcome.rule_button')}
                        </Button>
                    </CardActions>
                </Box>
                <Box
                    display={{ xs: 'none', sm: 'none', md: 'block' }}
                    sx={{
                        background: `url(${publishArticleImage}) top right / cover`,
                        marginLeft: 'auto',
                    }}
                    width="35em"
                    height="9em"
                    overflow="hidden"
                />
            </Box>
        </Card>
    );
};

export default Welcome;