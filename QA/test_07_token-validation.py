import time
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
import os
from selenium.common.exceptions import NoSuchElementException
from baseclass import TestBaseClass
import pytest

@pytest.mark.usefixtures("setup")
class TestClass(TestBaseClass):

    def test_authToken(self):

        driver = self.driver
        targetHost = os.environ.get('TARGET_HOST')
        server_name = os.environ.get('SERVER_NAME')
        nodeAppIp = os.environ.get('NODE_APP_IP')


        wait = WebDriverWait(driver, 15)

        def wait_for_element(by, selector):
            element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
            return element


        # Creating rule for access all requests
        wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
        wait_for_element(By.NAME, "name").send_keys("Access all rule-py")
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        wait_for_element(By.NAME, "match.rules.path").send_keys("/")
        element = wait_for_element(By.NAME, "match.response.code")
        element.send_keys(Keys.END)
        length = len(element.get_attribute("value"))
        element.send_keys(Keys.BACKSPACE * length)
        element.send_keys("305")
        wait_for_element(By.NAME, "match.response.redirect_uri").send_keys(nodeAppIp)
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

        # Creating rule for access request with /api
        wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
        time.sleep(2)
        wait_for_element(By.NAME, "name").send_keys("Access api rule-py")
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        wait_for_element(By.NAME, "match.rules.path").send_keys("/api")
        time.sleep(2)
        try:
            wait_for_element(By.XPATH, "//div[@id='match.rules.jwt_token_validation']").click()
        except:
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//div[@id='match.rules.jwt_token_validation']"))
            wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//div[@id='match.rules.jwt_token_validation']"))).click()

        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        wait_for_element(By.XPATH, "//li[normalize-space()='Cookie header validation']").click()
        wait_for_element(By.NAME, "match.rules.jwt_token_validation_value").send_keys("Authorization")
        tokenKey = os.environ.get('JWT_TOKEN_KEY')
        wait_for_element(By.NAME, "match.rules.jwt_token_validation_key").send_keys(tokenKey)
        element = wait_for_element(By.NAME, "match.response.code")
        element.send_keys(Keys.END)
        length = len(element.get_attribute("value"))
        element.send_keys(Keys.BACKSPACE * length)
        element.send_keys("305")
        
        wait_for_element(By.NAME, "match.response.redirect_uri").send_keys(nodeAppIp)
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

        # Apply both rules to the server
        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        wait_for_element(By.XPATH, f"//td[contains(.,'{server_name}')]").click()
        wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
        wait_for_element(By.XPATH, "//div[@id='rules']").click()
        time.sleep(2)
        try:
            wait_for_element(By.XPATH, "//li[contains(.,'Access all rule-py')]").click()
        except:
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Access all rule-py')]"))
            wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'Access all rule-py')]"))).click()
        
        time.sleep(2)  
        driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases"))
        wait.until(expected_conditions.element_to_be_clickable((By.CSS_SELECTOR, ".button-add-match_cases"))).click()


        time.sleep(2)
        wait_for_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
        try:
            wait_for_element(By.XPATH, "//li[contains(.,'Access api rule-py')]").click()
        except:
            # Scroll to the element to make it visible
            time.sleep(2)
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'Access api rule-py')]"))
            # Wait for the element to be clickable
            wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'Access api rule-py')]"))).click()
                

        wait_for_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        time.sleep(2)
        wait_for_element(By.XPATH, "//button[normalize-space()='Save']").click()
        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        wait_for_element(By.XPATH, f"//td[contains(.,'{server_name}')]").click()
        wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
        driver.back()

        # Clicking the sync API button
        time.sleep(4)
        sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
        sync_button.click()
        time.sleep(4)

        driver.delete_all_cookies()

        if server_name == "localhost":
            frontUrl = "localhost:8000"
        else: 
            frontUrl = server_name
            
        # Accessing API without Authorization token in cookies
        time.sleep(2)
        driver.get("http://"+frontUrl+"/api/v2/sample-data.json")
        time.sleep(2)
        response1 = wait_for_element(By.XPATH, "//h1[normalize-space()='Configuration not match!']").text
        time.sleep(2)
        assert "Configuration not match!" in response1
        #print(response1)

        # Login and get Authorization cookie
        time.sleep(2)
        driver.get("http://"+frontUrl+"/")
        time.sleep(4)
        EMAIL = os.environ.get('LOGIN_EMAIL')
        PASSWORD = os.environ.get('LOGIN_PASSWORD')
        wait_for_element(By.NAME, "email").send_keys(EMAIL)
        wait_for_element(By.NAME, "password").send_keys(PASSWORD)
        wait_for_element(By.CSS_SELECTOR, "button[type='submit']").click()
        time.sleep(2)
        login_text = wait_for_element(By.CLASS_NAME, "message-container").text
        assert "Thank you for logging in." in login_text
        print(login_text)

        # Accessing API with Authorization token in cookies
        driver.get("http://"+frontUrl+"/api/v2/sample-data.json")
        time.sleep(4)
        response2 = wait_for_element(By.CSS_SELECTOR, "body pre").text
        assert "smartphones" in response2
        #print(response2)

        driver.delete_all_cookies()
        
    # Find and delete the rule containing the specific text
        driver.get(targetHost+"/#/")
        wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)

        rule_name1 = "Access all rule-py"
        rule_name2 = "Access api rule-py"

        try:
            rule1 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name1}')]]")
        except NoSuchElementException:
            driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
            rule1 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name1}')]]")
        except:    
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.CSS_SELECTOR, "button[aria-label='Go to page 2']"))
            wait_for_element(By.CSS_SELECTOR, "button[aria-label='Go to page 2']").click()
            time.sleep(2)
            rule1 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name1}')]]")


        checkbox = rule1.find_element(By.XPATH, ".//input[@type='checkbox']")
        checkbox.click()

        try:
            rule2 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name2}')]]")
        except NoSuchElementException:
            driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
            rule2 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name2}')]]")
        except:    
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.CSS_SELECTOR, "button[aria-label='Go to page 2']"))
            wait_for_element(By.CSS_SELECTOR, "button[aria-label='Go to page 1']").click()
            time.sleep(2)
            rule2 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name2}')]]")

        checkbox = rule2.find_element(By.XPATH, ".//input[@type='checkbox']")
        checkbox.click()

        driver.find_element(By.CSS_SELECTOR, "button[aria-label='Delete']").click()

        # Clicking the sync API button
        time.sleep(4)
        sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
        sync_button.click()
        time.sleep(2)
        sync_button.click()
        time.sleep(2)
