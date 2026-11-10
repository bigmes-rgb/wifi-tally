import React from 'react'
import { AppBar, Button, Container, makeStyles, Toolbar } from '@material-ui/core'
import { Link as RouterLink } from 'react-router-dom'

const useStyles = makeStyles(theme => {
  return {
    // the wordmark: "ACC" set heavy, a thin divider, "Tally" light
    brand: {
      display: "flex",
      alignItems: "baseline",
      gap: theme.spacing(1),
      marginRight: theme.spacing(3),
      color: "inherit",
      textDecoration: "none",
      whiteSpace: "nowrap",
    },
    brandAcc: { fontSize: "1.35rem", fontWeight: 700, letterSpacing: "0.06em" },
    brandBar: { fontSize: "1.35rem", fontWeight: 300, opacity: 0.5 },
    brandTally: { fontSize: "1.35rem", fontWeight: 300, letterSpacing: "0.02em" },
    contentContainer: {
      marginTop: theme.spacing(2),
    },
  }
})

type LayoutProps = {
  testId: string // this makes it easy in cypress to determine on which page we are
  children?: React.ReactNode
}

const Layout = ({testId: cypressId, children}: LayoutProps) => {
  const classes = useStyles()

  return (<div data-testid={`page-${cypressId}`}>
    <AppBar position="static">
      <Toolbar>
        <RouterLink to="/" className={classes.brand} aria-label="ACC | Tally" data-testid="brand">
          <span className={classes.brandAcc}>ACC</span><span className={classes.brandBar}>|</span><span className={classes.brandTally}>Tally</span>
        </RouterLink>
        <Button component={RouterLink} to="/">Tallies</Button>
        <Button component={RouterLink} to="/config">Configuration</Button>
        <Button component={RouterLink} to="/flasher">Flash</Button>
        <Button component={RouterLink} to="/setup">Setup</Button>
      </Toolbar>
    </AppBar>
    { children && (<Container maxWidth={false} className={classes.contentContainer} children={children} />) }
  </div>)
}

export default Layout;