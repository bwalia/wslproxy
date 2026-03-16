To build the k3s cluster run

```ansible-playbook infra/ansible/playbook01.yaml -i infra/ansible/hosts-homelab --tags=k3s```

To deploy all necessary kubernetes manifests and helm charts

```ansible-playbook infra/ansible/playbook01.yaml -i infra/ansible/hosts-homelab --tags=masters```

To add remove master nodes and restart k3s cluster

```ansible-playbook infra/ansible/playbook01.yaml -i infra/ansible/hosts-homelab --tags=manifests```

To add remove workers to the cluster and restart k3s cluster

```ansible-playbook infra/ansible/playbook01.yaml -i infra/ansible/hosts-homelab --tags=workers```

To destroy the k3s cluster run these ansible scripts on all nodes:

```ansible all -m shell -i infra/ansible/hosts-homelab -l ubuntu -a "bash /usr/local/bin/k3s-killall.sh || bash /usr/local/bin/k3s-agent-uninstall.sh || bash /usr/local/bin/k3s-uninstall.sh"```


