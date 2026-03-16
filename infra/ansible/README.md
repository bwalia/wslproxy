Role Name
=========

WSLProxy builds nginx (OpenResty) from source with lua dynamic scripts to allow it to be integrated with Consul and other service mesh solutions for HA

Requirements
------------

- Ubuntu >= 22.04
- OpenResty source
- Lua
- Lua modules to interact with DNS, SSL, IP2Location database, etc.


Role Variables
--------------

WSLProxy relies on various environment variables in the Ansible playbook to work properly
A description of the settable variables for this role should go here, including any variables that are in defaults/main.yml, vars/main.yml, and any variables that can/should be set via parameters to the role. Any variables that are read from other roles and/or the global scope (ie. hostvars, group vars, etc.) should be mentioned here as well.

Dependencies
------------

*** Needs to be updated ***

- A list of other roles hosted on Galaxy should go here, plus any details in regards to parameters that may need to be set for other roles, or variables that are used from other roles.

Example Playbook
----------------

Including an example of how to use your role (for instance, with variables passed in as parameters) is always nice for users too:

    - hosts: servers
      roles:
         - { role: username.rolename, x: 42 }

License
-------

BSD

Author Information
------------------

An optional section for the role authors to include contact information, or a website (HTML is not allowed).
