#!/bin/bash
# file: start_on_boot.sh
node_loc=$(which node)
cur_dir=$(pwd)
envsubst >./caracAL.service <<EOF
[Unit]
Description=caracAL - Node client for adventure.land
Documentation=https://github.com/numbereself/caracAL
After=network.target

[Service]
Environment=CARACAL_SERVICE=OHYEAH
Type=simple
User=pi
WorkingDirectory=$cur_dir
ExecStart=$node_loc main.js
Restart=always
StandardOutput=null
StandardError=null

[Install]
WantedBy=multi-user.target
EOF
sudo systemctl link ./caracAL.service
sudo systemctl enable caracAL.service
