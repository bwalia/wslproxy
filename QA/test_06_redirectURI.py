import time
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions
from selenium.webdriver.support.wait import WebDriverWait
from selenium.common.exceptions import NoSuchElementException    
from baseclass import TestBaseClass
import os
import pytest


@pytest.mark.usefixtures("setup")
class TestClass(TestBaseClass):

    def test_redirectRule(self):
        driver = self.driver
        targetHost = os.environ.get('TARGET_HOST')
        server_name = os.environ.get('SERVER_NAME')

    # Creating redirect rule with 305
        wait = WebDriverWait(driver, 15)

        def wait_for_element(by, selector):
            element = wait.until(expected_conditions.presence_of_element_located((by, selector)))
            return element

        wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
        wait_for_element(By.NAME, "name").send_keys("redirect rule 305-py")
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        wait_for_element(By.NAME, "match.rules.path").send_keys("/")
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        element = wait_for_element(By.NAME, "match.response.code")
        # Clear the text using backspace key
        element.click()
        element.send_keys(Keys.END)
        length = len(element.get_attribute("value"))
        element.send_keys(Keys.BACKSPACE * length)
        # time.sleep(2)
        element.send_keys("305")
        wait_for_element(By.NAME, "match.response.allow").click()
        wait_for_element(By.NAME, "match.response.redirect_uri").send_keys("httpbin.org")
        wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    # Creating redirect rule with 302
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
        wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
        wait_for_element(By.NAME, "name").send_keys("redirect rule 302-py")
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        wait_for_element(By.NAME, "match.rules.path").send_keys("/google")
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        element = wait_for_element(By.NAME, "match.response.code")
        # Clear the text using backspace key
        element.click()
        element.send_keys(Keys.END)
        length = len(element.get_attribute("value"))
        element.send_keys(Keys.BACKSPACE * length)
        # time.sleep(2)
        element.send_keys("302")
        wait_for_element(By.NAME, "match.response.allow").click()
        wait_for_element(By.NAME, "match.response.redirect_uri").send_keys("https://google.com")
        wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()

    # Creating redirect rule with 301
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
        wait_for_element(By.XPATH, "//a[@href='#/rules/create']").click()
        wait_for_element(By.NAME, "name").send_keys("redirect rule 301-py")
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        wait_for_element(By.NAME, "match.rules.path").send_keys("/docker")
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        element = wait_for_element(By.NAME, "match.response.code")
        # Clear the text using backspace key
        element.click()
        element.send_keys(Keys.END)
        length = len(element.get_attribute("value"))
        element.send_keys(Keys.BACKSPACE * length)
        element.send_keys("301")
        wait_for_element(By.NAME, "match.response.allow").click()
        wait_for_element(By.NAME, "match.response.redirect_uri").send_keys("https://hub.docker.com/")
        wait_for_element(By.CSS_SELECTOR, ".MuiButton-sizeMedium").click()
        driver.refresh()

        # Apply rules to the server
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)
        wait_for_element(By.XPATH, f"//td[contains(.,'{server_name}')]").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
        wait_for_element(By.XPATH, "//div[@id='rules']").click()
        time.sleep(2)
        try:
            wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 305-py')]").click()
        except:
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 305-py')]"))
            # Wait for the element to be clickable
            wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'redirect rule 305-py')]"))).click()
        time.sleep(2)
        driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases"))
        wait.until(expected_conditions.element_to_be_clickable((By.CSS_SELECTOR, ".button-add-match_cases"))).click()
        time.sleep(2)  
        wait_for_element(By.XPATH, "//div[@id='match_cases.0.statement']").click()
        time.sleep(2)
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        try:
            wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 302-py')]").click()
            
        except: 
            time.sleep(2)
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 302-py')]"))
            # Wait for the element to be clickable
            wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'redirect rule 302-py')]"))).click()

        wait_for_element(By.XPATH, "//div[@id='match_cases.0.condition']").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()
        time.sleep(2)

        wait_for_element(By.CSS_SELECTOR, ".button-add-match_cases").click()       
        wait_for_element(By.XPATH, "//div[@id='match_cases.1.statement']").click()
        time.sleep(2)
        try:
            wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 301-py')]").click()
        except:    
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.XPATH, "//li[contains(.,'redirect rule 301-py')]"))
            # Wait for the element to be clickable
            wait.until(expected_conditions.element_to_be_clickable((By.XPATH, "//li[contains(.,'redirect rule 301-py')]"))).click()
        
        wait_for_element(By.XPATH, "//div[@id='match_cases.1.condition']").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(text(),'AND')]").click()

        time.sleep(2)
        driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
        time.sleep(2)
        wait_for_element(By.XPATH, "//button[normalize-space()='Save']").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/servers']").click()
        wait_for_element(By.XPATH, f"//td[contains(.,'{server_name}')]").click()
        wait_for_element(By.XPATH, "//a[@id='tabheader-1']").click()
        driver.refresh()
        driver.back()

        # Clicking the sync API button
        time.sleep(4)
        sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
        sync_button.click()
        time.sleep(4)

        # Verifying the rule redirect with 305
        driver.get("http://"+server_name+"/")
        time.sleep(2)
        driver.refresh()
        time.sleep(2)
        response1 = wait_for_element(By.XPATH, "//h2[@class='title']").text
        assert "httpbin.org" in response1
        #print(response1)
        
        # Verifying the rule redirect with 302
        time.sleep(2)
        try:
            driver.get("http://"+server_name+"/google")
            time.sleep(4)
        except:
            driver.get("http://"+server_name+"/google")
            time.sleep(4)

        try:
            response2 = wait_for_element(By.NAME, "btnK").get_attribute("value")
            assert "Google Search" in response2
            #print(response2)
        except:
            driver.refresh()
            time.sleep(4)
            response2 = wait_for_element(By.NAME, "btnK").get_attribute("value")
            assert "Google Search" in response2
            #print(response2, "-Second attempt")

        # Verifying the rule redirect with 301
        time.sleep(2)
        try:
            driver.get("http://"+server_name+"/docker")
            time.sleep(4)
        except:
            driver.get("http://"+server_name+"/docker")
            time.sleep(4)

        try:
            response3 = wait_for_element(By.XPATH, "//div[@class='styles-module__subtitle___WKocD']").text
            assert "Docker Hub" in response3
            #print(response3)
        except:
            time.sleep(2)
            driver.refresh()
            time.sleep(4)
            response3 = wait_for_element(By.XPATH, "//div[@class='styles-module__subtitle___WKocD']").text
            assert "Docker Hub" in response3
            #print(response3, "-Second attempt")    
        time.sleep(4)
        
        # Find and delete the rule containing the specific text
        driver.get(targetHost+"/#/")
        time.sleep(2)
        wait_for_element(By.XPATH, "//a[@href='#/rules']").click()
        wait_for_element(By.ID, "profile_id").click()
        time.sleep(2)
        wait_for_element(By.XPATH, "//li[contains(.,'qa_test')]").click()
        time.sleep(2)

        rule_name1 = "redirect rule 301-py"
        rule_name2 = "redirect rule 302-py"
        rule_name3 = "redirect rule 305-py"

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

        try:
            rule3 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name3}')]]")
        except NoSuchElementException:
            driver.execute_script("window.scrollBy(0, document.body.scrollHeight);")
            rule3 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name3}')]]")
        except:    
            driver.execute_script("arguments[0].scrollIntoView();", wait_for_element(By.CSS_SELECTOR, "button[aria-label='Go to page 2']"))
            wait_for_element(By.CSS_SELECTOR, "button[aria-label='Go to page 2']").click()
            time.sleep(2)
            rule3 = wait_for_element(By.XPATH, f"//tr[td/span[contains(text(), '{rule_name3}')]]")

        checkbox = rule3.find_element(By.XPATH, ".//input[@type='checkbox']")
        checkbox.click()

        driver.find_element(By.CSS_SELECTOR, "button[aria-label='Delete']").click()

        # Clicking the sync API button
        time.sleep(4)
        sync_button = wait_for_element(By.XPATH, "//button[@aria-label='Sync API Storage']")
        sync_button.click()
        time.sleep(4)