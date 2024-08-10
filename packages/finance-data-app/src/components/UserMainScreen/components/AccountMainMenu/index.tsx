import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Dropdown, Button } from 'antd';
import { LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { signOut } from 'supertokens-auth-react/recipe/session';
import './style.css';

export { AccountMainMenu };

function AccountMainMenu(props: { className?: string; onSignOut?: () => void | Promise<void> }) {
  const navigateTo = useNavigate();

  return (
    <Dropdown
      className={`cmp-account-main-menu ${props.className ?? ''}`}
      menu={{
        items: [
          {
            key: 'sign_out',
            danger: true,
            onClick: handleSignOut,
            label: (
              <div>
                <LogoutOutlined /> Sign Out
              </div>
            ),
          },
        ],
      }}
    >
      <Button
        className="account-main-menu-button"
        icon={<UserOutlined className="user-icon" />}
        size="large"
        type="text"
      >
        Account
      </Button>
    </Dropdown>
  );

  async function handleSignOut() {
    await signOut();
    await props.onSignOut?.();
    navigateTo('/auth');
  }
}
